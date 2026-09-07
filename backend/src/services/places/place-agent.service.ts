import { Pool } from 'pg';

export interface LieuTrouve {
  lat: number;
  lng: number;
  nom: string;
  adresse: string;
  source: 'memoire' | 'nominatim' | 'photon' | 'overpass' | 'google-lien';
}

// ─── Agent Lieux : recherche auto après frappe admin ─────────────────────
// Ordre : 1) mémoire locale (lieux déjà trouvés/confirmés)
//         2) sources gratuites côté serveur (Nominatim, Photon, Overpass)
//         3) slot Google réservé : max 3/jour (clé API officielle à brancher,
//            AUCUN scraping — respect des CGU Google, IP du serveur protégée)
const QUOTA_GOOGLE_PAR_JOUR = 3;

async function fetchJson(url: string, init?: any, timeoutMs = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'RMASC-OnSite/1.0 (place-agent, 3 req/jour max)',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export class PlaceAgentService {
  constructor(private pool: Pool) {}

  private norm(q: string): string {
    return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  }

  // Compteur quota Google du jour (slot réservé, pas de scraping)
  async quotaGoogleRestant(): Promise<number> {
    try {
      const { rows } = await this.pool.query(
        `SELECT COUNT(*)::int AS n FROM agent_recherche_log
         WHERE fournisseur = 'google' AND date_creation::date = CURRENT_DATE`
      );
      return Math.max(0, QUOTA_GOOGLE_PAR_JOUR - (rows[0]?.n || 0));
    } catch {
      return QUOTA_GOOGLE_PAR_JOUR;
    }
  }

  private async log(requete: string, fournisseur: string, nb: number) {
    try {
      await this.pool.query(
        `INSERT INTO agent_recherche_log (requete, fournisseur, nb_resultats)
         VALUES ($1, $2, $3)`,
        [requete.slice(0, 200), fournisseur, nb]
      );
    } catch { /* table absente = non bloquant */ }
  }

  async rechercher(queryBrute: string): Promise<{ lieux: LieuTrouve[]; quotaGoogleRestant: number; conseilGoogle?: string }> {
    const q = queryBrute.trim();
    const qn = this.norm(q);
    const lieux: LieuTrouve[] = [];
    const vus = new Set<string>();
    const quotaGoogleRestant = await this.quotaGoogleRestant();

    function ajouter(l: LieuTrouve) {
      if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return;
      const cle = `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`;
      if (vus.has(cle) || lieux.length >= 8) return;
      vus.add(cle);
      lieux.push(l);
    }

    if (qn.length < 3) return { lieux, quotaGoogleRestant };

    // 1) MÉMOIRE — lieux déjà appris (dont usine RMASC une fois confirmée)
    try {
      const { rows } = await this.pool.query(
        `SELECT nom, adresse, ST_Y(coordonnees::geometry) AS lat, ST_X(coordonnees::geometry) AS lng
         FROM lieux_connus
         WHERE LOWER(nom) LIKE '%' || $1 || '%' OR LOWER(adresse) LIKE '%' || $1 || '%'
         ORDER BY nb_confirmations DESC, date_modification DESC LIMIT 4`,
        [qn]
      );
      for (const r of rows) {
        ajouter({ lat: Number(r.lat), lng: Number(r.lng), nom: r.nom, adresse: r.adresse || '', source: 'memoire' });
      }
    } catch { /* table créée par migration v24 */ }
    if (lieux.length >= 4) {
      await this.log(q, 'memoire', lieux.length);
      return { lieux, quotaGoogleRestant };
    }

    // 2a) Nominatim (Algérie d'abord)
    try {
      const data = await fetchJson(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=dz&limit=5&accept-language=fr&addressdetails=1`
      );
      for (const d of Array.isArray(data) ? data : []) {
        const lat = parseFloat(d.lat), lng = parseFloat(d.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        ajouter({
          lat, lng,
          nom: String(d.display_name || '').split(',').slice(0, 2).join(','),
          adresse: String(d.display_name || ''),
          source: 'nominatim',
        });
      }
    } catch { /* suivant */ }

    // 2b) Photon (noms commerciaux)
    if (lieux.length < 8) {
      try {
        const data = await fetchJson(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=fr&lat=28.0&lon=2.0&location_bias_scale=0.6`
        );
        for (const f of (data && data.features) || []) {
          const c = f.geometry && f.geometry.coordinates;
          if (!c || !Number.isFinite(c[1]) || !Number.isFinite(c[0])) continue;
          const p = f.properties || {};
          const nom = p.name || p.street || '';
          if (!nom) continue;
          ajouter({
            lat: c[1], lng: c[0], nom,
            adresse: [nom, p.city || p.state || p.country || ''].filter(Boolean).join(', '),
            source: 'photon',
          });
        }
      } catch { /* suivant */ }
    }

    // 2c) Overpass — commerces / usines / hôtels nommés en Algérie
    if (lieux.length < 8) {
      try {
        const echappe = q.replace(/"/g, '').slice(0, 60);
        const req = `[out:json][timeout:12];(node["name"~"${echappe}",i](24.0,-9.0,37.5,12.0);way["name"~"${echappe}",i](24.0,-9.0,37.5,12.0););out center 6;`;
        const data = await fetchJson('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(req),
        }, 15000);
        for (const el of (data && data.elements) || []) {
          const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const tags = el.tags || {};
          if (!tags.name) continue;
          const detail = tags['addr:city'] || tags.shop || tags.amenity || tags.industrial || '';
          ajouter({ lat, lng, nom: tags.name, adresse: [tags.name, detail].filter(Boolean).join(' — '), source: 'overpass' });
        }
      } catch { /* suivant */ }
    }

    // 3) Rien trouvé → conseil Google (lien collé = exact gratuit, sans toucher à Google)
    let conseilGoogle: string | undefined;
    if (lieux.length === 0) {
      conseilGoogle = `Introuvable en base libre. Sur Google Maps : clic droit sur le lieu → copier le lien → collez-le ici (ex: .../@36.3701,3.9008,15z). Slot Google auto réservé : ${quotaGoogleRestant}/3 aujourd'hui.`;
    }
    await this.log(q, lieux.length > 0 ? 'libre' : 'vide', lieux.length);
    return { lieux, quotaGoogleRestant, conseilGoogle };
  }

  // L'admin choisit un résultat (ou colle un point Google) → mémorisé pour toujours
  async memoriser(nom: string, adresse: string, lat: number, lng: number, source = 'admin'): Promise<void> {
    if (!nom || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < 18 || lat > 38 || lng < -10 || lng > 13) return; // garde-fou Algérie
    await this.pool.query(
      `INSERT INTO lieux_connus (nom, adresse, coordonnees, source, nb_confirmations)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, 1)
       ON CONFLICT (nom) DO UPDATE SET
         adresse = EXCLUDED.adresse,
         coordonnees = EXCLUDED.coordonnees,
         nb_confirmations = lieux_connus.nb_confirmations + 1,
         date_modification = NOW()`,
      [nom.slice(0, 200), (adresse || '').slice(0, 500), lng, lat, source.slice(0, 30)]
    );
  }
}
