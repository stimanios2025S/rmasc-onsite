import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';

// ─── GeoFlotte I2B : connecteur réel (Quasar SPA) ───────────────────────────
// Portal : https://i2b.geoflotte.com/  →  API : https://i2b.geoflotte.com/api
// Login  : POST /getsession  →  token JWT (usertoken), header Authorization: Bearer
// Flotte : POST /allinfovehiculebyclient, /getVehicleDetailListByClient, ...
// Temps réel : POST /tramesreels  (les "trames réelles" GPS)
// 100% gratuit : polling serveur, aucun abonnement.
// Tout véhicule vu sur GeoFlotte mais absent chez nous est IMPORTÉ AUTO
// (nom réel + position directe) → la page Véhicules se remplit toute seule.

export interface PositionVehicule {
  identifiant: string;
  nom?: string;
  latitude: number;
  longitude: number;
  vitesse_kmh: number;
  en_mouvement: boolean;
  adresse?: string;
  date_position?: string;
}

export class GeoflotteService {
  private token = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private pool: Pool, private logger: LoggerService) {}

  // ─── Env en lecture LAZY (dotenv chargé après les imports) ──────────────
  private get base(): string {
    return (process.env.GEOFLOTTE_URL || 'https://i2b.geoflotte.com').replace(/\/+$/, '');
  }
  private get api(): string {
    return this.base.endsWith('/api') ? this.base : this.base + '/api';
  }
  private get user(): string {
    return (process.env.GEOFLOTTE_USER || '').trim();
  }
  private get pass(): string {
    return (process.env.GEOFLOTTE_PASS || '').trim();
  }
  private get company(): string {
    return (process.env.GEOFLOTTE_COMPANY || 'rmasc').trim();
  }
  // Token collé manuellement (localStorage → usertoken) = mode garanti.
  // Si le login auto est rejeté par le portail, ce token contourne tout.
  private get tokenManuel(): string {
    return (process.env.GEOFLOTTE_TOKEN || '').trim();
  }
  // Refresh token (localStorage → refreshToken) : le portail tue le usertoken
  // côté serveur ("Invalid token") → on en remint un frais via /getNewToken.
  // C'est ça qui rend la connexion durable, sans recopier le token à la main.
  private get refreshManuel(): string {
    return (process.env.GEOFLOTTE_REFRESH_TOKEN || '').trim();
  }
  private get intervalle(): number {
    return parseInt(process.env.GEOFLOTTE_INTERVALLE_MS || '60000', 10) || 60000;
  }

  get configure(): boolean {
    return this.user !== '' && this.pass !== '';
  }

  demarrer(): void {
    if (!this.configure) {
      this.logger.info('GeoFlotte non configuré (GEOFLOTTE_USER/PASS vides) — mode manuel actif.');
      return;
    }
    if (this.timer) return;
    this.logger.info(`GeoFlotte polling démarré (${this.base}, toutes les ${Math.round(this.intervalle / 1000)}s).`);
    this.synchroniser().catch(() => {});
    this.timer = setInterval(() => {
      this.synchroniser().catch((e: any) =>
        this.logger.error('GeoFlotte sync échouée (non bloquant)', { erreur: e.message }));
    }, this.intervalle);
  }

  arreter(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ─── HTTP helper (timeout 20s) ───────────────────────────────────────────
  // Retourne { status, json } — le appelant décide (Invalid token = refresh auto).
  private async postJSON(path: string, body: any, avecToken = true): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'RMASC-OnSite/1.0' };
      if (avecToken && this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(this.api + path, {
        method: 'POST', headers, body: JSON.stringify(body ?? {}), signal: ctrl.signal,
      } as any);
      const txt = await res.text().catch(() => '');
      if (!res.ok) return null;
      try { return txt ? JSON.parse(txt) : null; } catch { return null; }
    } catch { return null; } finally { clearTimeout(t); }
  }

  // Le portail répond {"error":true,"message":"Invalid token"} quand le
  // usertoken a expiré → on efface le token et on retente un login auto.
  private estTokenInvalide(j: any): boolean {
    if (!j || typeof j !== 'object') return false;
    const msg = String((j as any).message || '').toLowerCase();
    return (j as any).error === true &&
      (msg.includes('invalid token') || msg.includes('token') && msg.includes('expir'));
  }

  private marquerTokenInvalide(): void {
    this.token = '';
    this.logger.error('GeoFlotte : token expiré/invalide (Invalid token). Collez un nouveau usertoken (F12 → localStorage) dans GEOFLOTTE_TOKEN, ou vérifiez GEOFLOTTE_USER/PASS.');
  }

  private extraireToken(j: any): string | null {
    if (!j || typeof j !== 'object') {
      if (typeof j === 'string' && j.length > 20) return j;
      return null;
    }
    const cands = [j.token, j.usertoken, j.accessToken, j.access_token,
      j.data?.token, j.data?.usertoken, j.result?.token, j.session?.token, j.data?.result?.token];
    for (const c of cands) {
      if (typeof c === 'string' && c.length > 20) return c;
    }
    return null;
  }

  // ─── DIAGNOSTIC : expose pourquoi le portail rejette le login ────────────
  // Appelé par GET /api/admin/vehicules/diag — montre la réponse EXACTE du
  // portail pour chaque forme de login, sans jamais afficher le mot de passe.
  async diagnostiquer(): Promise<any> {
    const U = this.user, C = this.company;
    const base = this.api;
    const essais: Array<{ nom: string; corps: any }> = [
      { nom: 'username/password', corps: { username: U, password: '***' } },
      { nom: 'username/password+remember', corps: { username: U, password: '***', rememberMe: true } },
      { nom: 'login/password', corps: { login: U, password: '***' } },
      { nom: 'account+username', corps: { account: C, username: U, password: '***' } },
      { nom: 'account+login', corps: { account: C, login: U, password: '***' } },
      { nom: 'client+username', corps: { client: C, username: U, password: '***' } },
      { nom: 'company+username', corps: { company: C, username: U, password: '***' } },
      { nom: 'societe+username', corps: { societe: C, username: U, password: '***' } },
      { nom: 'slash', corps: { username: `${C}/${U}`, password: '***' } },
      { nom: 'dot', corps: { username: `${C}.${U}`, password: '***' } },
      { nom: 'loginContact', corps: { loginContact: U, password: '***' } },
      { nom: 'email', corps: { email: U, password: '***' } },
    ];
    const P = this.pass;
    const resultats: any[] = [];
    for (const e of essais) {
      const vraiCorps = JSON.parse(JSON.stringify(e.corps).replace('"***"', JSON.stringify(P)));
      const brut = await this.postJSON('/getsession', vraiCorps, false);
      const copie = brut && typeof brut === 'object' ? { ...brut } : brut;
      if (copie && typeof copie === 'object') {
        for (const k of ['token', 'usertoken', 'accessToken', 'access_token']) {
          if (typeof (copie as any)[k] === 'string') (copie as any)[k] = '◼︎◼︎◼︎(reçu, masqué)';
        }
        if (copie.data && typeof copie.data === 'object') {
          for (const k of ['token', 'usertoken']) {
            if (typeof (copie.data as any)[k] === 'string') (copie.data as any)[k] = '◼︎◼︎◼︎(reçu, masqué)';
          }
        }
      }
      resultats.push({ essai: e.nom, reponse: copie });
      if (this.extraireToken(brut)) {
        resultats.push({ essai: '✅ LOGIN OK avec', reponse: e.nom });
        break;
      }
    }
    // Token manuel présent ? le tester
    let tokenManuelOk: boolean | null = null;
    if (this.tokenManuel) {
      this.token = this.tokenManuel;
      const chk = await this.postJSON('/checkSession', {});
      tokenManuelOk = !!(chk && (chk as any).error !== true);
      const flotte = tokenManuelOk ? await this.lirePositions() : [];
      return { base, user: U, company: C, tokenManuel: 'présent', tokenManuelOk, vehiculesLus: flotte.length, echantillon: flotte.slice(0, 2), essais: resultats };
    }
    return { base, user: U, company: C, tokenManuel: 'absent', essais: resultats };
  }

  // ─── LOGIN réel : POST /getsession (champ société inclus) ────────────────
  private async connecter(): Promise<boolean> {
    // 1) Token manuel (garanti) — prioritaire.
    // Le checkSession avec corps vide peut répondre error:true même avec un
    // token valide → on valide le token sur la FLOTTE RÉELLE, pas sur checkSession.
    if (this.tokenManuel) {
      this.token = this.tokenManuel;
      try {
        const flotte = await this.lirePositions();
        if (flotte.length > 0) {
          this.logger.info(`GeoFlotte token manuel OK — ${flotte.length} véhicule(s).`);
          return true;
        }
      } catch { /* fallback checkSession ci-dessous */ }
      const chk = await this.postJSON('/checkSession', {});
      if (chk && (chk as any).error !== true) return true;
      // Dernier filet : le token est peut-être valide mais la flotte répond
      // sous une enveloppe inattendue → on garde le token et on laisse
      // synchroniser() trancher (0 véhicule lu ≠ rejet).
      this.logger.error('GEOFLOTTE_TOKEN incertain (flotte vide + checkSession KO) — bascule login auto.');
    }
    // 1b) Token expiré côté serveur → refresh auto via /getNewToken
    // (refreshToken du localStorage, origine utils/auth.js comme le front).
    if (this.refreshManuel) {
      try {
        const savedToken = this.token;
        this.token = '';
        const j = await this.postJSON('/getNewToken',
          { refreshToken: this.refreshManuel, origin: 'utils/auth.js' }, false);
        const frais = this.extraireToken(j);
        if (frais) {
          this.token = frais;
          const flotte = await this.lirePositions();
          if (flotte.length > 0) {
            this.logger.info(`GeoFlotte refresh OK — ${flotte.length} véhicule(s), token renouvelé.`);
            return true;
          }
        }
        this.token = savedToken;
      } catch { /* fallback login auto ci-dessous */ }
    }
    // 2) Session existante encore valide ?
    if (this.token) {
      const chk = await this.postJSON('/checkSession', {});
      if (chk && (chk as any).error !== true) return true;
    }
    const U = this.user, P = this.pass, C = this.company;
    const payloads: any[] = [
      { username: U, password: P, rememberMe: true },
      { username: U, password: P },
      { login: U, password: P },
      { identifiant: U, password: P },
      { account: C, username: U, password: P },
      { account: C, login: U, password: P },
      { client: C, username: U, password: P },
      { societe: C, username: U, password: P },
      { dossier: C, username: U, password: P },
      { username: `${C}/${U}`, password: P },
      { username: `${C}_${U}`, password: P },
      { username: `${C}.${U}`, password: P },
      { loginContact: U, password: P },
    ];
    for (const body of payloads) {
      const j = await this.postJSON('/getsession', body, false);
      const tok = this.extraireToken(j);
      if (tok) {
        this.token = tok;
        this.logger.info('GeoFlotte login OK (getsession).');
        return true;
      }
    }
    this.token = '';
    return false;
  }

  // ─── Extraction tolérante d'un tableau depuis n'importe quelle enveloppe ─
  // La réponse /tramesreels arrive sous enveloppe variable (result/data/liste/
  // TrameReelListe...) → recherche récursive du premier tableau de positions.
  private tableauDe(j: any, profondeur = 0): any[] {
    if (!j || profondeur > 3) return [];
    if (Array.isArray(j)) return j;
    if (typeof j !== 'object') return [];
    const clesDirectes = ['result', 'data', 'list', 'liste', 'rows', 'items', 'results',
      'vehicules', 'vehicles', 'units', 'devices', 'trames', 'frames',
      'TrameReelListe', 'trameReelListe', 'tramesreels', 'TramesReels', 'tramesReels'];
    for (const k of clesDirectes) {
      const v = (j as any)[k];
      if (Array.isArray(v) && v.length > 0) return v;
    }
    // Sinon : premier tableau non vide trouvé en profondeur (objets avec lat/lng en priorité)
    let fallback: any[] = [];
    for (const k of Object.keys(j)) {
      const v = (j as any)[k];
      if (Array.isArray(v) && v.length > 0) {
        const premier = v[0];
        if (premier && typeof premier === 'object' &&
          ('lat' in premier || 'latitude' in premier || 'Latitude' in premier || 'lng' in premier ||
           'lon' in premier || 'longitude' in premier || 'Longitude' in premier || 'y' in premier || 'x' in premier)) {
          return v;
        }
        if (fallback.length === 0) fallback = v;
      } else if (v && typeof v === 'object') {
        const sous = this.tableauDe(v, profondeur + 1);
        if (sous.length > 0) return sous;
      }
    }
    return fallback;
  }

  private normaliser(d: any): PositionVehicule | null {
    if (!d || typeof d !== 'object') return null;
    const p = d.position || d.pos || d.coord || d;
    const lat = Number(d.lat ?? d.latitude ?? d.Latitude ?? p.lat ?? p.latitude ?? d.y ?? d.Y);
    const lng = Number(d.lng ?? d.lon ?? d.longitude ?? d.Longitude ?? p.lng ?? p.lon ?? p.longitude ?? d.x ?? d.X);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    const identifiant = String(
      d.imei ?? d.IMEI ?? d.device_id ?? d.deviceId ?? d.unit_id ?? d.unitId ??
      d.immatriculation ?? d.plaque ?? d.id ?? d.name ?? d.nom ?? d.label ?? d.vehicule ?? '').trim();
    const nom = String(d.name ?? d.nom ?? d.label ?? d.vehicule ?? d.immatriculation ?? d.plaque ?? identifiant).trim().slice(0, 100);
    const vitesse = Number(d.vitesse ?? d.speed ?? d.vitesse_kmh ?? d.speed_kmh ?? 0) || 0;
    return {
      identifiant: identifiant || nom,
      nom: nom || undefined,
      latitude: lat, longitude: lng,
      vitesse_kmh: vitesse,
      en_mouvement: Boolean(d.moving ?? d.en_mouvement ?? d.motion ?? (vitesse > 3)),
      adresse: d.address ?? d.adresse ?? d.adress ?? undefined,
      date_position: d.time ?? d.date ?? d.timestamp ?? d.dateTrame ?? d.datetrame ?? undefined,
    };
  }

  // ─── Lecture flotte + temps réel ─────────────────────────────────────────
  // Payload réel vu dans Network (Temps Réel v2.0) :
  //   POST /api/tramesreels  {app:"TrameReelListe", version:446}  → 200 2.3kB
  private async lirePositions(): Promise<PositionVehicule[]> {
    const C = this.company, U = this.user;
    const trameBody: any = { app: 'TrameReelListe', version: 446 };
    const corpsesGeneriques: any[] = [
      {}, { client: C }, { account: C }, { username: U },
      { IDClient: 4082 }, { idClient: 4082 }, { client: 4082 },
    ];
    const endpoints: Array<{ ep: string; bodies: any[] }> = [
      { ep: '/tramesreels', bodies: [trameBody, { ...trameBody, client: C }, { ...trameBody, IDClient: 4082 }] },
      { ep: '/lasttajettramesNew', bodies: [trameBody] },
      { ep: '/lasttajettrames', bodies: [trameBody] },
      { ep: '/allinfovehiculebyclient', bodies: corpsesGeneriques },
      { ep: '/getVehicleDetailListByClient', bodies: corpsesGeneriques },
      { ep: '/getVehicleListByClientWithMileage', bodies: corpsesGeneriques },
    ];
    const bruts: any[] = [];
    for (const { ep, bodies } of endpoints) {
      for (const body of bodies) {
        const j = await this.postJSON(ep, body);
        // Token mort → on l'efface une fois, le login auto prendra le relais
        if (this.estTokenInvalide(j)) { this.marquerTokenInvalide(); return []; }
        const arr = this.tableauDe(j);
        if (arr.length > 0) {
          bruts.push(...arr);
          break; // ce endpoint parle → corps suivant inutile
        }
      }
      if (bruts.length > 0 && (ep === '/tramesreels' || ep.startsWith('/lasttajet'))) break;
    }
    const positions: PositionVehicule[] = [];
    for (const d of bruts) {
      const n = this.normaliser(d);
      if (n && n.identifiant) positions.push(n);
    }
    // Dédupliquer par identifiant (garder la 1re occurrence = la plus fraîche)
    const vus = new Set<string>();
    return positions.filter(p => {
      const k = (p.identifiant + '|' + (p.nom || '')).toLowerCase();
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }

  // ─── Sync : login → flotte+trames → match ou IMPORT AUTO → upsert ────────
  async synchroniser(): Promise<number> {
    if (!this.configure && !this.tokenManuel) return 0;
    const ok = await this.connecter();
    // Si le token manuel existe, on tente la lecture même si connecter() doute :
    // connecter() peut se tromper quand la flotte répond sous une enveloppe
    // inattendue. Seule la lecture réelle tranche.
    if (!ok && !this.tokenManuel) {
      this.logger.error('GeoFlotte login impossible — vérifiez GEOFLOTTE_USER/PASS/COMPANY (mode manuel actif).');
      return 0;
    }
    if (!ok && this.tokenManuel) this.token = this.tokenManuel;
    const positions = await this.lirePositions();
    if (positions.length === 0) {
      this.logger.info('GeoFlotte connecté mais 0 véhicule lu (endpoints muets — mode manuel actif).');
      return 0;
    }
    const { rows: vehicules } = await this.pool.query(
      `SELECT id, nom, immatriculation, imei, geoflotte_id FROM vehicules WHERE actif = TRUE`);
    let maj = 0, crees = 0;
    const matchedIdx = new Set<number>();
    for (const v of vehicules) {
      const cles = [v.geoflotte_id, v.imei, v.nom, v.immatriculation].filter(Boolean).map((s: string) => s.toLowerCase());
      const idx = positions.findIndex(pos =>
        cles.some(c => pos.identifiant.toLowerCase().includes(c) || (pos.nom || '').toLowerCase().includes(c)));
      if (idx === -1) continue;
      matchedIdx.add(idx);
      const p = positions[idx];
      await this.pool.query(
        `INSERT INTO vehicules_positions (vehicule_id, latitude, longitude, vitesse_kmh, en_mouvement, adresse, date_position, date_reception)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), NOW())
         ON CONFLICT (vehicule_id) DO UPDATE SET
           latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           vitesse_kmh = EXCLUDED.vitesse_kmh, en_mouvement = EXCLUDED.en_mouvement,
           adresse = EXCLUDED.adresse, date_position = EXCLUDED.date_position,
           date_reception = NOW()`,
        [v.id, p.latitude, p.longitude, p.vitesse_kmh, p.en_mouvement, p.adresse || null, p.date_position || null]);
      maj++;
    }
    // ─── IMPORT AUTO : tout véhicule GeoFlotte absent chez nous est créé ───
    for (let i = 0; i < positions.length; i++) {
      if (matchedIdx.has(i)) continue;
      const p = positions[i];
      const nom = String(p.nom || p.identifiant || `Véhicule ${i + 1}`).trim().slice(0, 100);
      if (!nom) continue;
      try {
        const ins = await this.pool.query(
          `INSERT INTO vehicules (nom, imei, geoflotte_id) VALUES ($1, $2, $3)
           ON CONFLICT (nom) DO NOTHING RETURNING id`,
          [nom, p.identifiant || null, p.identifiant || null]);
        let vehId: string | null = ins.rows[0]?.id || null;
        if (!vehId) {
          const ex = await this.pool.query(`SELECT id FROM vehicules WHERE nom = $1`, [nom]);
          vehId = ex.rows[0]?.id || null;
        }
        if (!vehId) continue;
        await this.pool.query(
          `INSERT INTO vehicules_positions (vehicule_id, latitude, longitude, vitesse_kmh, en_mouvement, adresse, date_position, date_reception)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), NOW())
           ON CONFLICT (vehicule_id) DO UPDATE SET
             latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
             vitesse_kmh = EXCLUDED.vitesse_kmh, en_mouvement = EXCLUDED.en_mouvement,
             adresse = EXCLUDED.adresse, date_position = EXCLUDED.date_position,
             date_reception = NOW()`,
          [vehId, p.latitude, p.longitude, p.vitesse_kmh, p.en_mouvement, p.adresse || null, p.date_position || null]);
        crees++;
      } catch { /* un véhicule en échec ne bloque pas les autres */ }
    }
    this.logger.info(`GeoFlotte sync OK — ${positions.length} lue(s), ${maj} maj, ${crees} importé(s).`);
    return maj + crees;
  }
}
