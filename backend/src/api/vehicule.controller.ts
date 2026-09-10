import { Router } from 'express';
import { Pool } from 'pg';
import { verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';
import { GeoflotteService } from '../services/vehicules/geoflotte.service';

/**
 * Vehicule Controller — flotte GPS de la société (admin)
 *
 * Endpoints:
 *   GET    /api/admin/vehicules              — liste + dernière position + équipe utilisatrice
 *   POST   /api/admin/vehicules              — créer un véhicule
 *   PATCH  /api/admin/vehicules/:id          — modifier (nom, plaque, imei, geoflotte_id, statut, actif)
 *   DELETE /api/admin/vehicules/:id          — soft-delete (bloqué si EN_MISSION)
 *   POST   /api/admin/vehicules/sync         — forcer une synchro GeoFlotte immédiate
 *   POST   /api/admin/vehicules/assigner     — assigner un véhicule à une mission (optionnel)
 *   POST   /api/admin/vehicules/:id/liberer  — libérer manuellement un véhicule
 *   GET    /api/admin/vehicules/historique?vehicule_id= — qui a pris quoi, quand
 */
export function creerVehiculeRouter(pool: Pool, logger: LoggerService, geoflotte?: GeoflotteService): Router {
  const router = Router();
  router.use(verifierToken);

  // ─── LISTE + positions + équipe utilisatrice ─────────────────────────
  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT v.id, v.nom, v.immatriculation, v.imei, v.geoflotte_id,
               v.statut, v.actif,
               TO_CHAR(v.date_creation, 'YYYY-MM-DD') AS date_creation,
               p.latitude, p.longitude, p.vitesse_kmh, p.en_mouvement, p.adresse,
               TO_CHAR(p.date_position, 'YYYY-MM-DD HH24:MI') AS date_position,
               e.nom AS equipe_nom, e.id AS equipe_id,
               c.nom_chantier AS chantier_nom
        FROM vehicules v
        LEFT JOIN vehicules_positions p ON p.vehicule_id = v.id
        LEFT JOIN vehicules_affectations a ON a.vehicule_id = v.id AND a.statut = 'en_cours'
        LEFT JOIN equipes e ON e.id = a.equipe_id
        LEFT JOIN chantiers c ON c.id = a.chantier_id
        WHERE v.actif = TRUE
        ORDER BY v.nom`);
      res.json(rows);
    } catch (err: any) {
      logger.error('Erreur listing véhicules', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── CRÉER ───────────────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const { nom, immatriculation, imei, geoflotte_id } = req.body;
      if (!nom || !String(nom).trim()) {
        return res.status(400).json({ erreur: 'Nom du véhicule requis.' });
      }
      const { rows } = await pool.query(
        `INSERT INTO vehicules (nom, immatriculation, imei, geoflotte_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, nom, immatriculation, imei, geoflotte_id, statut, actif`,
        [String(nom).trim(), immatriculation || null, imei || null, geoflotte_id || null]);
      logger.info('Véhicule créé', { id: rows[0].id, nom: rows[0].nom });
      res.status(201).json({ ok: true, vehicule: rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ erreur: 'Ce nom de véhicule existe déjà.' });
      logger.error('Erreur création véhicule', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── MODIFIER ────────────────────────────────────────────────────────
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { nom, immatriculation, imei, geoflotte_id, statut, actif } = req.body;
      const sets: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (nom !== undefined) { sets.push(`nom = $${idx++}`); values.push(String(nom).trim()); }
      if (immatriculation !== undefined) { sets.push(`immatriculation = $${idx++}`); values.push(immatriculation || null); }
      if (imei !== undefined) { sets.push(`imei = $${idx++}`); values.push(imei || null); }
      if (geoflotte_id !== undefined) { sets.push(`geoflotte_id = $${idx++}`); values.push(geoflotte_id || null); }
      if (statut !== undefined) {
        if (!['DISPONIBLE', 'EN_MISSION', 'EN_PANNE'].includes(statut)) {
          return res.status(400).json({ erreur: 'Statut invalide (DISPONIBLE, EN_MISSION, EN_PANNE).' });
        }
        sets.push(`statut = $${idx++}`); values.push(statut);
      }
      if (actif !== undefined) { sets.push(`actif = $${idx++}`); values.push(!!actif); }
      if (sets.length === 0) return res.status(400).json({ erreur: 'Aucun champ à modifier.' });
      sets.push('date_modification = NOW()');
      values.push(id);
      const { rows } = await pool.query(
        `UPDATE vehicules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, nom, statut`, values);
      if (rows.length === 0) return res.status(404).json({ erreur: 'Véhicule introuvable.' });
      logger.info('Véhicule modifié', { id, champs: Object.keys(req.body) });
      res.json({ ok: true, vehicule: rows[0] });
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ erreur: 'Ce nom de véhicule existe déjà.' });
      logger.error('Erreur modification véhicule', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── SUPPRIMER (soft-delete) ─────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(`SELECT id, nom, statut FROM vehicules WHERE id = $1`, [id]);
      if (rows.length === 0) return res.status(404).json({ erreur: 'Véhicule introuvable.' });
      if (rows[0].statut === 'EN_MISSION') {
        return res.status(409).json({ erreur: `« ${rows[0].nom} » est en mission. Libérez-le d'abord.` });
      }
      await pool.query(`UPDATE vehicules SET actif = FALSE, date_modification = NOW() WHERE id = $1`, [id]);
      logger.info('Véhicule supprimé (soft-delete)', { id, nom: rows[0].nom });
      res.json({ ok: true, message: `Véhicule « ${rows[0].nom} » supprimé.` });
    } catch (err: any) {
      logger.error('Erreur suppression véhicule', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── DIAGNOSTIC GeoFlotte : pourquoi le login échoue (réponse exacte) ──
  router.get('/diag', async (_req, res) => {
    try {
      if (!geoflotte) return res.status(400).json({ erreur: 'Service GeoFlotte absent.' });
      const diag = await geoflotte.diagnostiquer();
      res.json(diag);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── SYNC MANUELLE GeoFlotte ─────────────────────────────────────────
  router.post('/sync', async (_req, res) => {
    try {
      if (!geoflotte || !geoflotte.configure) {
        return res.status(400).json({ erreur: 'GeoFlotte non configuré (GEOFLOTTE_USER/PASS). Mode manuel actif.' });
      }
      const maj = await geoflotte.synchroniser();
      res.json({ ok: true, message: `${maj} véhicule(s) mis à jour depuis GeoFlotte.` });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── ASSIGNER un véhicule à une mission (optionnel) ──────────────────
  router.post('/assigner', async (req: any, res) => {
    try {
      const { vehicule_id, mission_id } = req.body;
      if (!vehicule_id || !mission_id) {
        return res.status(400).json({ erreur: 'vehicule_id et mission_id requis.' });
      }
      const vRes = await pool.query(`SELECT id, nom, statut FROM vehicules WHERE id = $1 AND actif = TRUE`, [vehicule_id]);
      if (vRes.rows.length === 0) return res.status(404).json({ erreur: 'Véhicule introuvable.' });
      if (vRes.rows[0].statut !== 'DISPONIBLE') {
        return res.status(409).json({ erreur: `« ${vRes.rows[0].nom} » n'est pas disponible (${vRes.rows[0].statut}).` });
      }
      const mRes = await pool.query(
        `SELECT om.id, om.equipe_id, om.chantier_id, e.nom AS equipe_nom
         FROM ordres_de_mission om LEFT JOIN equipes e ON e.id = om.equipe_id
         WHERE om.id = $1`, [mission_id]);
      if (mRes.rows.length === 0) return res.status(404).json({ erreur: 'Mission introuvable.' });
      const mission = mRes.rows[0];
      await pool.query(`UPDATE vehicules SET statut = 'EN_MISSION', date_modification = NOW() WHERE id = $1`, [vehicule_id]);
      await pool.query(`UPDATE ordres_de_mission SET vehicule_id = $1 WHERE id = $2`, [vehicule_id, mission_id]);
      await pool.query(
        `INSERT INTO vehicules_affectations (vehicule_id, equipe_id, mission_id, chantier_id, cree_par)
         VALUES ($1, $2, $3, $4, $5)`,
        [vehicule_id, mission.equipe_id, mission_id, mission.chantier_id, req.user?.userId || null]);
      logger.info('Véhicule assigné', { vehicule: vRes.rows[0].nom, equipe: mission.equipe_nom });
      res.json({ ok: true, message: `« ${vRes.rows[0].nom} » assigné à ${mission.equipe_nom || 'la mission'}.` });
    } catch (err: any) {
      logger.error('Erreur assignation véhicule', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── LIBÉRER un véhicule ─────────────────────────────────────────────
  router.post('/:id/liberer', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(`UPDATE vehicules SET statut = 'DISPONIBLE', date_modification = NOW() WHERE id = $1`, [id]);
      await pool.query(
        `UPDATE vehicules_affectations SET statut = 'terminee', date_fin = NOW()
         WHERE vehicule_id = $1 AND statut = 'en_cours'`, [id]);
      await pool.query(`UPDATE ordres_de_mission SET vehicule_id = NULL WHERE vehicule_id = $1 AND statut != 'termine'`, [id]);
      res.json({ ok: true, message: 'Véhicule libéré — de nouveau disponible.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── HISTORIQUE : qui a pris quoi ────────────────────────────────────
  router.get('/historique/liste', async (req, res) => {
    try {
      const { vehicule_id } = req.query as { vehicule_id?: string };
      const { rows } = await pool.query(
        `SELECT a.id, v.nom AS vehicule_nom, e.nom AS equipe_nom, c.nom_chantier,
                TO_CHAR(a.date_debut, 'YYYY-MM-DD HH24:MI') AS debut,
                TO_CHAR(a.date_fin, 'YYYY-MM-DD HH24:MI') AS fin, a.statut
         FROM vehicules_affectations a
         JOIN vehicules v ON v.id = a.vehicule_id
         LEFT JOIN equipes e ON e.id = a.equipe_id
         LEFT JOIN chantiers c ON c.id = a.chantier_id
         ${vehicule_id ? 'WHERE a.vehicule_id = $1' : ''}
         ORDER BY a.date_debut DESC LIMIT 100`,
        vehicule_id ? [vehicule_id] : []);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}

/** Transfère le véhicule de la mission source vers la mission suivante (meca→elec→verif).
 *  Le véhicule suit le chantier : même statut EN_MISSION, historique chaîné. */
export async function transfererVehiculeMission(pool: Pool, missionSourceId: string, missionDestId: string): Promise<void> {
  try {
    if (!missionSourceId || !missionDestId || missionSourceId === missionDestId) return;
    const { rows } = await pool.query(
      `SELECT vehicule_id, equipe_id, chantier_id FROM ordres_de_mission WHERE id = $1 AND vehicule_id IS NOT NULL`,
      [missionSourceId]);
    if (rows.length === 0 || !rows[0].vehicule_id) return;
    const src = rows[0];
    // Copier le véhicule sur la mission suivante
    await pool.query(`UPDATE ordres_de_mission SET vehicule_id = $1 WHERE id = $2 AND vehicule_id IS NULL`,
      [src.vehicule_id, missionDestId]);
    // Clore l'affectation source et ouvrir la suivante (chaîne qui-a-pris-quoi)
    const destRes = await pool.query(`SELECT equipe_id, chantier_id FROM ordres_de_mission WHERE id = $1`, [missionDestId]);
    const dest = destRes.rows[0] || { equipe_id: src.equipe_id, chantier_id: src.chantier_id };
    await pool.query(
      `UPDATE vehicules_affectations SET statut = 'terminee', date_fin = NOW()
       WHERE mission_id = $1 AND statut = 'en_cours'`, [missionSourceId]);
    await pool.query(
      `INSERT INTO vehicules_affectations (vehicule_id, equipe_id, mission_id, chantier_id)
       VALUES ($1, $2, $3, $4)`,
      [src.vehicule_id, dest.equipe_id, missionDestId, dest.chantier_id]);
  } catch { /* non bloquant */ }
}

/** Libère auto le véhicule quand sa mission se termine (appelé par tracking/mission). */
export async function libererVehiculeMission(pool: Pool, missionId: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT vehicule_id FROM ordres_de_mission WHERE id = $1 AND vehicule_id IS NOT NULL`, [missionId]);
    if (rows.length === 0) return;
    const vehiculeId = rows[0].vehicule_id;
    const { rows: autres } = await pool.query(
      `SELECT 1 FROM ordres_de_mission WHERE vehicule_id = $1 AND id != $2 AND statut != 'termine' LIMIT 1`,
      [vehiculeId, missionId]);
    if (autres.length === 0) {
      await pool.query(`UPDATE vehicules SET statut = 'DISPONIBLE', date_modification = NOW() WHERE id = $1`, [vehiculeId]);
    }
    await pool.query(
      `UPDATE vehicules_affectations SET statut = 'terminee', date_fin = NOW()
       WHERE mission_id = $1 AND statut = 'en_cours'`, [missionId]);
  } catch { /* non bloquant */ }
}
