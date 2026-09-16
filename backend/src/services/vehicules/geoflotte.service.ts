import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';

// ─── GeoFlotte REST API — connecteur professionnel ──────────────────────────
// Documentation : serviceweb.pdf — Service Web GeoFlotte
// Base URL      : https://services.geoflotte.com
// Auth          : API key dans l'URL (pas de session, pas de token JWT)
// Endpoints :
//   GET /getrealtime/{API_KEY}                        → flotte complète
//   GET /getrealtime/{API_KEY}?matricules=AA,BB       → véhicules spécifiques
//   GET /getreport/{API_KEY}?matricules=...&debut=...&fin=...  → trajets
//   GET /getreportfuel/{API_KEY}?matricules=...&debut=...&fin=... → trajets + carburant
//   GET /api/gettrames/{API_KEY}/{balise}?debut=...&fin=...      → historique positions
//
// 100% gratuit : polling serveur, aucun abonnement.
// Tout véhicule vu sur GeoFlotte mais absent chez nous est IMPORTÉ AUTO
// (nom réel + position directe) → la page Véhicules se remplit toute seule.

export interface PositionVehicule {
  identifiant: string;
  nom?: string;
  immatriculation?: string;
  latitude: number;
  longitude: number;
  vitesse_kmh: number;
  en_mouvement: boolean;
  adresse?: string;
  date_position?: string;
}

export interface RapportTrajet {
  matricule: string;
  date_debut: string;
  date_fin: string;
  distance_km: number;
  duree_min: number;
  vitesse_moyenne: number;
  carburant_depart?: number;
  carburant_fin?: number;
}

export class GeoflotteService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private dernierResultat: PositionVehicule[] = [];

  constructor(private pool: Pool, private logger: LoggerService) {}

  // ─── Env en lecture LAZY (dotenv chargé après les imports) ──────────────
  private get apiKey(): string {
    return (process.env.GEOFLOTTE_API_KEY || '').trim();
  }
  private get baseUrl(): string {
    return (process.env.GEOFLOTTE_BASE_URL || 'https://services.geoflotte.com').replace(/\/+$/, '');
  }
  private get intervalle(): number {
    return parseInt(process.env.GEOFLOTTE_INTERVALLE_MS || '60000', 10) || 60000;
  }

  /** Vérifie si le service est configuré (clé API présente). */
  get configure(): boolean {
    return this.apiKey.length > 0;
  }

  /** Dernier résultat connu (pour affichage immédiat sans re-fetch). */
  get positions(): PositionVehicule[] {
    return this.dernierResultat;
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────

  demarrer(): void {
    if (!this.configure) {
      this.logger.info('GeoFlotte non configuré (GEOFLOTTE_API_KEY vide) — mode manuel actif.');
      return;
    }
    if (this.timer) return;
    this.logger.info(`GeoFlotte REST polling démarré (${this.baseUrl}, toutes les ${Math.round(this.intervalle / 1000)}s).`);
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

  // ─── HTTP GET helper (timeout 15s, réponse JSON) ───────────────────────

  private async GET(path: string): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const url = `${this.baseUrl}${path}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RMASC-OnSite/1.0',
        },
        signal: ctrl.signal,
      } as any);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        this.logger.error(`GeoFlotte HTTP ${res.status}`, { url: url.replace(this.apiKey, '***'), reponse: txt.slice(0, 200) });
        return null;
      }
      const txt = await res.text().catch(() => '');
      try { return txt ? JSON.parse(txt) : null; } catch { return txt; }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        this.logger.error('GeoFlotte timeout (15s)', { path });
      }
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // ─── Diagnostic : vérifie la clé API et retourne un résumé ─────────────
  async diagnostiquer(): Promise<any> {
    const url = `${this.baseUrl}/getrealtime/${this.apiKey.slice(0, 6)}***`;
    if (!this.configure) {
      return { configure: false, erreur: 'GEOFLOTTE_API_KEY non définie dans .env', url };
    }
    const positions = await this.lirePositions();
    return {
      configure: true,
      base_url: this.baseUrl,
      api_key: `${this.apiKey.slice(0, 6)}***`,
      vehiculesLus: positions.length,
      echantillon: positions.slice(0, 3),
      endpoints: {
        realtime: `${this.baseUrl}/getrealtime/{API_KEY}`,
        report: `${this.baseUrl}/getreport/{API_KEY}?matricules=...&debut=...&fin=...`,
        reportFuel: `${this.baseUrl}/getreportfuel/{API_KEY}?matricules=...&debut=...&fin=...`,
        trames: `${this.baseUrl}/api/gettrames/{API_KEY}/{balise}?debut=...&fin=...`,
      },
    };
  }

  // ─── Lecture temps réel : GET /getrealtime/{API_KEY} ────────────────────
  // La réponse est un tableau JSON de véhicules avec position, vitesse, statut.
  // Format attendu (d'après doc) : tableau d'objets avec matricule, lat/lng, etc.
  // Le normalisateur gère les variantes de nommage possibles.

  private async lirePositions(): Promise<PositionVehicule[]> {
    const donnees = await this.GET(`/getrealtime/${this.apiKey}`);
    if (!donnees) return [];

    // La réponse peut être un tableau direct OU un objet enveloppe { data: [...] }
    let bruts: any[] = [];
    if (Array.isArray(donnees)) {
      bruts = donnees;
    } else if (typeof donnees === 'object') {
      // Chercher le premier tableau non vide dans l'enveloppe
      const cles = ['data', 'result', 'results', 'vehicules', 'vehicles', 'list', 'liste',
        'rows', 'items', 'recordset', 'recordsets', 'TrameReelListe'];
      for (const k of cles) {
        const v = (donnees as any)[k];
        if (Array.isArray(v) && v.length > 0) { bruts = v; break; }
      }
      // Si pas trouvé, chercher en profondeur 1 niveau
      if (bruts.length === 0) {
        for (const k of Object.keys(donnees)) {
          const v = (donnees as any)[k];
          if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
            bruts = v;
            break;
          }
        }
      }
    }

    if (!Array.isArray(bruts) || bruts.length === 0) return [];

    const positions: PositionVehicule[] = [];
    for (const d of bruts) {
      const p = this.normaliser(d);
      if (p && p.identifiant) positions.push(p);
    }

    // Dédupliquer par identifiant (garder la 1re occurrence = la plus fraîche)
    const vus = new Set<string>();
    return positions.filter(p => {
      const k = p.identifiant.toLowerCase();
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
  }

  // ─── Normalisation tolérante des champs ─────────────────────────────────
  // L'API peut renvoyer des champs en camelCase, snake_case, PascalCase, ou
  // français/anglais. Le normalisateur teste toutes les variantes courantes.

  private normaliser(d: any): PositionVehicule | null {
    if (!d || typeof d !== 'object') return null;

    // Coordonnées (priorité : champs explicites → nested position → alternatives)
    const p = d.position || d.pos || d.coord || d;
    const lat = Number(
      d.latitude ?? d.lat ?? d.Latitude ?? d.LATITUDE ??
      d.latitudeReel ?? d.latitudeReelle ??
      p.lat ?? p.latitude ?? p.Latitude ??
      d.y ?? d.Y ?? d.posY
    );
    const lng = Number(
      d.longitude ?? d.lng ?? d.lon ?? d.Longitude ?? d.LONGITUDE ??
      d.longitudeReel ?? d.longitudeReelle ??
      p.lng ?? p.lon ?? p.longitude ?? p.Longitude ??
      d.x ?? d.X ?? d.posX
    );
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;

    // Identifiant (préférer matricule/plaque → IMEI → nom)
    const identifiant = String(
      d.matricule ?? d.Matricule ?? d.numeroMatricule ?? d.PLATE ?? d.plate ??
      d.immatriculation ?? d.Immatriculation ?? d.IMMATRICULATION ??
      d.plaque ?? d.Plaque ?? d.PLAQUE ??
      d.imei ?? d.IMEI ?? d.NISBaliseReel ?? d.balise ??
      d.device_id ?? d.deviceId ?? d.unit_id ?? d.unitId ??
      d.codeVehicule ?? d.id ?? d.ID ??
      d.name ?? d.nom ?? d.label ?? ''
    ).trim();

    // Nom d'affichage
    const nom = String(
      d.nom ?? d.name ?? d.label ?? d.vehicule ?? d.vehicle ??
      d.codeVehicule ?? d.numeroMatricule ??
      d.immatriculation ?? d.plaque ?? identifiant
    ).trim().slice(0, 100);

    // Immatriculation (pour affichage badge)
    const immatriculation = String(
      d.immatriculation ?? d.Immatriculation ?? d.IMMATRICULATION ??
      d.matricule ?? d.Matricule ?? d.numeroMatricule ??
      d.plaque ?? d.Plaque ?? d.PLATE ?? ''
    ).trim() || undefined;

    // Vitesse
    const vitesse = Number(
      d.vitesse ?? d.vitesse_kmh ?? d.speed ?? d.speed_kmh ??
      d.vitesseReel ?? d.VitesseReel ?? 0
    ) || 0;

    // État moteur → en mouvement
    const moteur = d.etat_moteur ?? d.Moteur ?? d.EtatMoteur ?? d.engine_state ?? null;
    const enMouvement = (typeof moteur === 'number')
      ? (moteur === 1 || vitesse > 3)
      : Boolean(d.moving ?? d.en_mouvement ?? d.motion ?? d.enMovement ?? (vitesse > 3));

    // Adresse
    const adresse = String(
      d.adresse ?? d.address ?? d.lieu ?? d.location ??
      d.lieuReel ?? d.LieuReel ?? d.adress ?? ''
    ).trim() || undefined;

    // Date position
    const date_position = String(
      d.date_position ?? d.datePosition ?? d.timestamp ?? d.temps ??
      d.tempsReel ?? d.TempsReel ?? d.time ?? d.date ??
      d.dateTrame ?? d.datetrame ?? d.date_reception ?? ''
    ).trim() || undefined;

    if (!identifiant) return null;

    return {
      identifiant,
      nom: nom || undefined,
      immatriculation,
      latitude: lat,
      longitude: lng,
      vitesse_kmh: vitesse,
      en_mouvement: enMouvement,
      adresse,
      date_position,
    };
  }

  // ─── Sync : flotte temps réel → match ou IMPORT AUTO → upsert ──────────
  async synchroniser(): Promise<number> {
    if (!this.configure) return 0;

    const positions = await this.lirePositions();
    this.dernierResultat = positions;

    if (positions.length === 0) {
      this.logger.info('GeoFlotte REST : 0 véhicule lu (clé API invalide ou flotte vide — mode manuel actif).');
      return 0;
    }

    const { rows: vehicules } = await this.pool.query(
      `SELECT id, nom, immatriculation, imei, geoflotte_id FROM vehicules WHERE actif = TRUE`);

    let maj = 0, crees = 0;
    const matchedIdx = new Set<number>();

    // 1) Match : mettre à jour les véhicules existants
    for (const v of vehicules) {
      const cles = [v.geoflotte_id, v.imei, v.nom, v.immatriculation]
        .filter(Boolean)
        .map((s: string) => s.toLowerCase().trim());

      const idx = positions.findIndex(pos =>
        cles.some(c =>
          pos.identifiant.toLowerCase().includes(c) ||
          (pos.nom || '').toLowerCase().includes(c) ||
          (pos.immatriculation || '').toLowerCase().includes(c)
        )
      );
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

    // 2) IMPORT AUTO : tout véhicule GeoFlotte absent chez nous est créé
    for (let i = 0; i < positions.length; i++) {
      if (matchedIdx.has(i)) continue;
      const p = positions[i];
      const nom = String(p.nom || p.identifiant || `Véhicule ${i + 1}`).trim().slice(0, 100);
      if (!nom) continue;

      try {
        const ins = await this.pool.query(
          `INSERT INTO vehicules (nom, immatriculation, imei, geoflotte_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (nom) DO NOTHING RETURNING id`,
          [nom, p.immatriculation || null, p.identifiant || null, p.identifiant || null]);

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

    this.logger.info(`GeoFlotte REST sync OK — ${positions.length} lu(s), ${maj} maj, ${crees} importé(s).`);
    return maj + crees;
  }

  // ─── Rapports (utilisables par l'admin) ────────────────────────────────

  /** Liste des trajets pour une période donnée. */
  async listerTrajets(matricules: string[], debut: string, fin: string): Promise<any> {
    if (!this.configure) return { erreur: 'GeoFlotte non configuré.' };
    const m = matricules.join(',');
    return this.GET(`/getreport/${this.apiKey}?matricules=${encodeURIComponent(m)}&debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`);
  }

  /** Détails des trajets + consommation carburant. */
  async listerTrajetsCarburant(matricules: string[], debut: string, fin: string): Promise<any> {
    if (!this.configure) return { erreur: 'GeoFlotte non configuré.' };
    const m = matricules.join(',');
    return this.GET(`/getreportfuel/${this.apiKey}?matricules=${encodeURIComponent(m)}&debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`);
  }

  /** Historique des positions (trames) pour un véhicule donné. */
  async historiquePositions(balise: string, debut: string, fin: string): Promise<any> {
    if (!this.configure) return { erreur: 'GeoFlotte non configuré.' };
    return this.GET(`/api/gettrames/${this.apiKey}/${encodeURIComponent(balise)}?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`);
  }
}
