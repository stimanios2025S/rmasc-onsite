import { Pool } from 'pg';

export interface LieuTrouve {
  lat: number;
  lng: number;
  nom: string;
  adresse: string;
  source: 'memoire' | 'nominatim' | 'photon' | 'overpass' | 'wikidata' | 'google-lien';
}

// Mots qui empêchent de trouver : "usine rmasc" → essaie aussi "rmasc" seul
const STOPWORDS = new Set([
  'usine', 'factory', 'fabrique', 'sarl', 'eurl', 'ets', 'spa', 'entreprise',
  'parc', 'park', 'motel', 'hotel', 'hôtel', 'shop', 'magasin', 'store',
  'promotion', 'residence', 'résidence', 'centre', 'center', 'de', 'la', 'le',
  'les', 'des', 'du', 'd', 'l', 'notre', 'notre', 'the', 'our',
]);

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

// Google renvoie du HTML (pas du JSON) → il faut le texte brut pour y lire les coordonnées
async function fetchHtml(url: string, timeoutMs = 12000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    return await res.text();
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

    // Requêtes élargies : "usine rmasc bouira" → ["usine rmasc bouira", "rmasc bouira", "rmasc"]
    const tokens = qn.split(' ').filter(t => t.length > 1);
    const motsFort = tokens.filter(t => !STOPWORDS.has(t));
    const variantes: string[] = [q];
    const ville = tokens.length > 1 ? tokens[tokens.length - 1] : '';
    if (motsFort.length > 0 && motsFort.length < tokens.length) {
      variantes.push(ville && !STOPWORDS.has(ville)
        ? `${motsFort.join(' ')} ${ville}`.trim()
        : motsFort.join(' '));
      if (motsFort.length > 1) variantes.push(motsFort[0]);
    }
    if (ville && !variantes.includes(ville) && variantes.length < 3) variantes.push(ville);

    async function chercherNominatim(requete: string, limite: number): Promise<void> {
      for (const scope of ['dz', '']) {
        try {
          const suffixe = scope ? '' : ' Algérie';
          const data = await fetchJson(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(requete + suffixe)}${scope ? '&countrycodes=dz' : ''}&limit=${limite}&accept-language=fr&addressdetails=1`
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
          if (lieux.length >= 4) return;
        } catch { /* variante suivante */ }
      }
    }

    // 1) MÉMOIRE — lieux déjà appris : requête entière PUIS mots forts
    // ("usine rmasc" attrape "RMASC" même si le nom exact diffère)
    try {
      const cles = [qn, ...variantes.slice(1).map(v => v.toLowerCase())].slice(0, 3);
      for (const cle of cles) {
        const { rows } = await this.pool.query(
          `SELECT nom, adresse, ST_Y(coordonnees::geometry) AS lat, ST_X(coordonnees::geometry) AS lng
           FROM lieux_connus
           WHERE LOWER(nom) LIKE '%' || $1 || '%' OR LOWER(adresse) LIKE '%' || $1 || '%'
           ORDER BY nb_confirmations DESC, date_modification DESC LIMIT 4`,
          [cle]
        );
        for (const r of rows) {
          ajouter({ lat: Number(r.lat), lng: Number(r.lng), nom: r.nom, adresse: r.adresse || '', source: 'memoire' });
        }
        if (lieux.length >= 4) break;
      }
    } catch { /* table créée par migration v24 */ }
    if (lieux.length >= 4) {
      await this.log(q, 'memoire', lieux.length);
      return { lieux, quotaGoogleRestant };
    }

    // 2a) Nominatim — chaque variante (requête entière + mots forts)
    for (const v of variantes) {
      if (lieux.length >= 8) break;
      await chercherNominatim(v, 5);
    }

    // 2b) Photon — chaque variante (noms commerciaux)
    for (const v of variantes) {
      if (lieux.length >= 8) break;
      try {
        const data = await fetchJson(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(v)}&limit=5&lang=fr&lat=28.0&lon=2.0&location_bias_scale=0.6`
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
      } catch { /* variante suivante */ }
    }

    // 2c) Overpass — mots forts cherchés dans name/brand/operator (attrape "RMASC" même taggé usine)
    for (const v of variantes) {
      if (lieux.length >= 8) break;
      try {
        const echappe = v.replace(/"/g, '').replace(/\\/g, '').slice(0, 40);
        if (echappe.length < 2) continue;
        const req = `[out:json][timeout:12];(node["name"~"${echappe}",i](24.0,-9.0,37.5,12.0);way["name"~"${echappe}",i](24.0,-9.0,37.5,12.0);node["brand"~"${echappe}",i](24.0,-9.0,37.5,12.0);way["brand"~"${echappe}",i](24.0,-9.0,37.5,12.0);node["operator"~"${echappe}",i](24.0,-9.0,37.5,12.0););out center 6;`;
        const data = await fetchJson('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(req),
        }, 15000);
        for (const el of (data && data.elements) || []) {
          const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          const tags = el.tags || {};
          const nom = tags.name || tags.brand || tags.operator || '';
          if (!nom) continue;
          const detail = tags['addr:city'] || tags.shop || tags.amenity || tags.industrial || tags.man_made || '';
          ajouter({ lat, lng, nom, adresse: [nom, detail].filter(Boolean).join(' — '), source: 'overpass' });
        }
      } catch { /* variante suivante */ }
    }

    // 2d) Wikidata — entreprises / lieux d'Algérie par nom (source libre, ex: usines connues)
    if (lieux.length < 8 && motsFort.length > 0) {
      try {
        const data = await fetchJson(
          `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(motsFort.join(' '))}&language=fr&limit=6&format=json&origin=*`
        );
        for (const e of (data && data.search) || []) {
          if (lieux.length >= 8) break;
          try {
            const det = await fetchJson(
              `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${e.id}&property=P625&format=json&origin=*`, undefined, 8000
            );
            const claim = det?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
            if (!claim || !Number.isFinite(claim.latitude) || !Number.isFinite(claim.longitude)) continue;
            if (claim.latitude < 18 || claim.latitude > 38 || claim.longitude < -10 || claim.longitude > 13) continue;
            ajouter({ lat: claim.latitude, lng: claim.longitude, nom: e.label || e.id, adresse: e.description || '', source: 'wikidata' });
          } catch { /* entité suivante */ }
        }
      } catch { /* ignorer */ }
    }

    // 3) Dernier étage — Google direct, juste après la frappe (max 3/jour) :
    //    l'admin tape le nom, l'agent interroge Google lui-même et rend le point
    //    exact sur la carte. Requête unique légère, comportement navigateur.
    let conseilGoogle: string | undefined;
    if (lieux.length === 0 && quotaGoogleRestant > 0) {
      try {
        // Google renvoie du HTML : on y extrait les coordonnées embarquées
        // Formats vus : @LAT,LNG dans l'URL, ou !3dLAT!4dLNG, ou [lat,lng]
        const html = await fetchHtml(
          `https://www.google.com/maps/search/${encodeURIComponent(q + ' Algérie')}?hl=fr`
        );
        if (html && html.length > 5000) {
        const points: { lat: number; lng: number }[] = [];
        const push = (lat: number, lng: number) => {
          if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 18 && lat <= 38 && lng >= -10 && lng <= 13) {
            if (!points.some(p => Math.abs(p.lat - lat) < 0.002 && Math.abs(p.lng - lng) < 0.002)) {
              points.push({ lat, lng });
            }
          }
        };
        let mAt = html.match(/@(-?\d{1,2}\.\d{3,7})\s*,\s*(-?\d{1,3}\.\d{3,7})/);
        if (mAt) push(parseFloat(mAt[1]), parseFloat(mAt[2]));
        const re34 = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g;
        let m34: RegExpExecArray | null;
        while ((m34 = re34.exec(html)) !== null && points.length < 3) {
          push(parseFloat(m34[1]), parseFloat(m34[2]));
        }
        const reArr = /\[\s*(-?\d{1,2}\.\d{4,7})\s*,\s*(-?\d{1,3}\.\d{4,7})\s*\]/g;
        let mArr: RegExpExecArray | null;
        while ((mArr = reArr.exec(html)) !== null && points.length < 3) {
          push(parseFloat(mArr[1]), parseFloat(mArr[2]));
        }
        if (points.length > 0) {
          ajouter({
            lat: points[0].lat, lng: points[0].lng,
            nom: `📍 ${q} (Google)`,
            adresse: `${points[0].lat.toFixed(6)}, ${points[0].lng.toFixed(6)} — trouvé auto par l'agent`,
            source: 'google-lien',
          });
          await this.log(q, 'google', 1);
          // Mémorisé direct : la prochaine fois, 0 recherche externe
          try {
            await this.memoriser(q.slice(0, 200), `${points[0].lat.toFixed(6)}, ${points[0].lng.toFixed(6)}`, points[0].lat, points[0].lng, 'agent:google');
          } catch { /* non bloquant */ }
          const restant = await this.quotaGoogleRestant();
          return { lieux, quotaGoogleRestant: restant };
        }
        await this.log(q, 'google-vide', 0);
        } // fin if html valide
      } catch { /* Google injoignable → conseil manuel ci-dessous */ }
    }

    // 4) Vraiment rien → conseil : coller le lien Google à la main (gratuit, exact)
    if (lieux.length === 0) {
      const restant = await this.quotaGoogleRestant();
      conseilGoogle = restant > 0
        ? `Introuvable même via Google auto. Sur Google Maps : clic droit sur le lieu → copier le lien → collez-le ici (ex: .../@36.3701,3.9008,15z). Slot Google : ${restant}/3 aujourd'hui.`
        : `Quota Google du jour épuisé (3/3). Collez le lien Google Maps du lieu ici pour le point exact gratuit, ou réessayez demain.`;
      return { lieux, quotaGoogleRestant: restant, conseilGoogle };
    }
    await this.log(q, 'libre', lieux.length);
    return { lieux, quotaGoogleRestant };
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
