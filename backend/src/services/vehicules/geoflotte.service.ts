import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';

// ─── GeoFlotte : lecture des positions GPS des véhicules ─────────────────
// Principe : login user/pass (compte admin/admin fourni par le patron) sur
// https://i2b.geoflotte.com, session cookie, puis lecture périodique des
// dernières positions → table vehicules_positions (1 ligne / véhicule).
// 100% gratuit : aucun abonnement, juste le polling côté serveur.
// Si le portail GeoFlotte change son HTML/API, le polling échoue en silence
// (non bloquant) et la page admin continue en mode manuel (assignation).

const BASE = process.env.GEOFLOTTE_URL || 'https://i2b.geoflotte.com';
const USER = process.env.GEOFLOTTE_USER || '';
const PASS = process.env.GEOFLOTTE_PASS || '';
const INTERVALLE_MS = parseInt(process.env.GEOFLOTTE_INTERVALLE_MS || '60000', 10);

export interface PositionVehicule {
  identifiant: string; // geoflotte_id / imei / nom — ce qu'on arrive à lire
  nom?: string;
  latitude: number;
  longitude: number;
  vitesse_kmh: number;
  en_mouvement: boolean;
  adresse?: string;
  date_position?: string;
}

export class GeoflotteService {
  private cookies = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private pool: Pool, private logger: LoggerService) {}

  get configure(): boolean {
    return USER !== '' && PASS !== '';
  }

  demarrer(): void {
    if (!this.configure) {
      this.logger.info('GeoFlotte non configuré (GEOFLOTTE_USER/PASS vides) — mode manuel actif.');
      return;
    }
    if (this.timer) return;
    this.logger.info(`GeoFlotte polling démarré (${BASE}, toutes les ${Math.round(INTERVALLE_MS / 1000)}s).`);
    this.synchroniser().catch(() => {});
    this.timer = setInterval(() => {
      this.synchroniser().catch((e: any) =>
        this.logger.error('GeoFlotte sync échouée (non bloquant)', { erreur: e.message }));
    }, INTERVALLE_MS);
  }

  arreter(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ─── Login : essaie les formulaires courants, garde le cookie de session
  private async connecter(): Promise<boolean> {
    if (this.cookies) return true;
    const tentatives = [
      { url: `${BASE}/login`, champU: 'username', champP: 'password' },
      { url: `${BASE}/api/login`, champU: 'login', champP: 'password' },
      { url: `${BASE}/`, champU: 'user', champP: 'pass' },
    ];
    for (const t of tentatives) {
      try {
        const corps = new URLSearchParams({ [t.champU]: USER, [t.champP]: PASS }).toString();
        const res = await fetch(t.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RMASC-OnSite/1.0 (flotte-entreprise)',
            Accept: 'text/html,application/json,*/*',
          },
          body: corps,
          redirect: 'manual',
        } as any);
        const setCookie = (res.headers as any).get?.('set-cookie') || (res.headers as any).raw?.()?.['set-cookie']?.join('; ') || '';
        if (setCookie) this.cookies = setCookie.split(',').map((c: string) => c.split(';')[0]).join('; ');
        if (res.status < 400) {
          // Vérifier que la session est réelle : la page d'accueil ne doit plus rediriger vers login
          const check = await fetch(BASE + '/', { headers: { Cookie: this.cookies, 'User-Agent': 'RMASC-OnSite/1.0' }, redirect: 'manual' } as any);
          if (check.status < 400) return true;
        }
      } catch { /* tentative suivante */ }
    }
    return this.cookies !== '';
  }

  // ─── Lecture des positions : essaie les endpoints JSON courants du portail
  private async lirePositions(): Promise<PositionVehicule[]> {
    const urls = [
      `${BASE}/api/positions`, `${BASE}/api/devices/positions`, `${BASE}/api/last`,
      `${BASE}/positions.json`, `${BASE}/api/units`, `${BASE}/get_positions`,
    ];
    for (const u of urls) {
      try {
        const res = await fetch(u, {
          headers: { Cookie: this.cookies, 'User-Agent': 'RMASC-OnSite/1.0', Accept: 'application/json' },
        } as any);
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const liste = Array.isArray(data) ? data : data?.positions || data?.units || data?.devices || data?.data || [];
        const positions: PositionVehicule[] = [];
        for (const d of Array.isArray(liste) ? liste : []) {
          const lat = Number(d.lat ?? d.latitude ?? d.y);
          const lng = Number(d.lng ?? d.lon ?? d.longitude ?? d.x);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          positions.push({
            identifiant: String(d.imei ?? d.device_id ?? d.unit_id ?? d.id ?? d.name ?? d.nom ?? ''),
            nom: d.name ?? d.nom,
            latitude: lat, longitude: lng,
            vitesse_kmh: Number(d.speed ?? d.vitesse ?? 0) || 0,
            en_mouvement: Boolean(d.moving ?? d.en_mouvement ?? (Number(d.speed ?? 0) > 3)),
            adresse: d.address ?? d.adresse,
            date_position: d.time ?? d.date ?? d.timestamp,
          });
        }
        if (positions.length > 0) return positions;
      } catch { /* endpoint suivant */ }
    }
    return [];
  }

  // ─── Sync : login → positions → match par geoflotte_id/imei/nom → upsert
  async synchroniser(): Promise<number> {
    if (!this.configure) return 0;
    const ok = await this.connecter();
    if (!ok) {
      this.logger.error('GeoFlotte login impossible — vérifiez GEOFLOTTE_USER/PASS (mode manuel actif).');
      return 0;
    }
    const positions = await this.lirePositions();
    if (positions.length === 0) {
      this.logger.info('GeoFlotte connecté mais 0 position lue (portail inattendu — mode manuel actif).');
      return 0;
    }
    const { rows: vehicules } = await this.pool.query(
      `SELECT id, nom, immatriculation, imei, geoflotte_id FROM vehicules WHERE actif = TRUE`);
    let maj = 0;
    for (const v of vehicules) {
      const cles = [v.geoflotte_id, v.imei, v.nom, v.immatriculation].filter(Boolean).map((s: string) => s.toLowerCase());
      const p = positions.find(pos =>
        cles.some(c => pos.identifiant.toLowerCase().includes(c) || (pos.nom || '').toLowerCase().includes(c)));
      if (!p) continue;
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
    this.logger.info(`GeoFlotte sync OK — ${positions.length} position(s) lue(s), ${maj} véhicule(s) mis à jour.`);
    return maj;
  }
}
