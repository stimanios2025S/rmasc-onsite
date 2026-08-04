import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';

export function creerAdminRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();
  router.use(verifierToken);

  // ─── DEMANDES EN ATTENTE ──────────────────────────────────────────
  router.get('/demandes', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, reference_commande_erp AS ref, client_nom, nom_chantier,
              statut, TO_CHAR(date_creation,'YYYY-MM-DD HH24:MI') AS cree
       FROM demandes_integration WHERE statut = 'EN_ATTENTE_VALIDATION'
       ORDER BY date_creation DESC`
    );
    res.json(rows);
  });

  // ─── APPROUVER UNE DEMANDE ────────────────────────────────────────
  router.post('/demandes/:id/approuver', async (req: any, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE demandes_integration
         SET statut = 'APPROUVE', traite_par = $1, traite_a = NOW()
         WHERE id = $2 AND statut = 'EN_ATTENTE_VALIDATION'
         RETURNING *`,
        [req.user!.userId, req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ erreur: 'Demande introuvable ou déjà traitée.' });
      }
      const d = rows[0];

      // Créer le chantier (avec complexité, fiches, fichiers)
      const chantierResult = await pool.query(
        `INSERT INTO chantiers
           (reference_commande_erp, nom_chantier, adresse, coordonnees,
            client_nom, client_telephone, statut,
            complexite, dxf_url, pdf_url, fiche_technique)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, 'planifie', $8, $9, $10, $11)
         RETURNING id`,
        [d.reference_commande_erp, d.nom_chantier, d.adresse_chantier,
         d.longitude, d.latitude, d.client_nom, d.client_telephone,
         d.complexite || 'MOYENNE', d.dxf_url || null, d.pdf_url || null,
         d.fiche_technique || null]
      );
      const chantierId = chantierResult.rows[0].id;

      // Trouver équipe mécanique DISPONIBLE (pas en repos)
      const equipeResult = await pool.query(
        `SELECT e.id, e.nom FROM equipes e
         WHERE e.type = 'mecanique' AND e.actif = TRUE
           AND e.statut_equipe = 'DISPONIBLE'
           AND e.disponible_a_partir_de <= NOW()
         ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om
                   WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
         LIMIT 1`
      );

      let missionInfo: any = { equipeNom: 'Aucune', equipeId: null, missionId: null };

      if (equipeResult.rows.length > 0) {
        const equipe = equipeResult.rows[0];
        // Marquer l'équipe comme EN_MISSION
        await pool.query(
          `UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`,
          [equipe.id]
        );
        // Créer la mission mécanique avec durée estimée
        const missionResult = await pool.query(
          `INSERT INTO ordres_de_mission
             (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours)
           VALUES ($1, $2, 'mecanique', 'en_attente', NOW(),
                   (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = 'mecanique'))
           RETURNING id`,
          [chantierId, equipe.id]
        );
        const missionId = missionResult.rows[0].id;

        // Créer la checklist mécanique
        await pool.query(
          `INSERT INTO checklists_phases (mission_id, phase, etapes)
           VALUES ($1, 'mecanique', generer_checklist('mecanique'))`,
          [missionId]
        );

        missionInfo = { equipeNom: equipe.nom, equipeId: equipe.id, missionId };
      }

      logger.info('Demande approuvée → Chantier + Mission', {
        demandeId: d.id, chantierId, equipe: missionInfo.equipeNom,
      });

      res.json({
        message: `✅ Chantier "${d.nom_chantier}" créé.`,
        chantierId,
        demandeId: d.id,
        equipeNom: missionInfo.equipeNom,
        missionId: missionInfo.missionId,
      });
    } catch (err: any) {
      logger.error('Erreur approbation', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── REFUSER UNE DEMANDE ─────────────────────────────────────────
  router.post('/demandes/:id/refuser', async (req: any, res) => {
    const { rows } = await pool.query(
      `UPDATE demandes_integration
       SET statut = 'REFUSE', traite_par = $1, traite_a = NOW()
       WHERE id = $2 AND statut = 'EN_ATTENTE_VALIDATION'
       RETURNING *`,
      [req.user!.userId, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erreur: 'Demande introuvable ou déjà traitée.' });
    }
    logger.info('Demande refusée', { demandeId: rows[0].id });
    res.json({ message: '❌ Demande refusée et archivée.', demandeId: rows[0].id });
  });

  // ─── STATUT ÉQUIPES ──────────────────────────────────────────────
  router.get('/equipes', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.nom, e.type, e.statut_equipe,
              TO_CHAR(e.disponible_a_partir_de,'YYYY-MM-DD HH24:MI') AS dispo,
              (SELECT COUNT(*) FROM ordres_de_mission om
               WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) AS missions,
              CASE WHEN e.disponible_a_partir_de > NOW()
                THEN EXTRACT(DAY FROM e.disponible_a_partir_de - NOW())::INT
                ELSE 0 END AS jours_repos_restants
       FROM equipes e ORDER BY e.type, e.nom`
    );
    res.json(rows);
  });

  // ─── STATS DASHBOARD ──────────────────────────────────────────────
  router.get('/stats', async (_req, res) => {
    const [chantiers, missions, demandes, blocages, pointages] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut='en_cours') AS en_cours, COUNT(*) FILTER (WHERE statut='bloque') AS bloques FROM chantiers`),
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut='en_cours') AS en_cours FROM ordres_de_mission`),
      pool.query(`SELECT COUNT(*) AS total FROM demandes_integration WHERE statut='EN_ATTENTE_VALIDATION'`),
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE statut='ouvert') AS ouverts FROM blocages_et_requisitions`),
      pool.query(`SELECT COUNT(*) AS total FROM equipes WHERE statut_equipe='DISPONIBLE'`),
    ]);
    res.json({
      chantiersActifs: chantiers.rows[0].en_cours,
      chantiersBloques: chantiers.rows[0].bloques,
      chantiersTotal: chantiers.rows[0].total,
      missionsEnCours: missions.rows[0].en_cours,
      missionsTotal: missions.rows[0].total,
      demandesEnAttente: demandes.rows[0].total,
      blocagesOuverts: blocages.rows[0].ouverts,
      blocagesTotal: blocages.rows[0].total,
      equipesDisponibles: pointages.rows[0].total,
    });
  });

  // ─── INCIDENTS (blocages + pointages récents) ─────────────────────
  router.get('/incidents', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT 'blocage' AS type, priorite, raison_blocage AS message,
              c.nom_chantier, TO_CHAR(b.date_creation,'YYYY-MM-DD HH24:MI') AS moment
       FROM blocages_et_requisitions b
       JOIN ordres_de_mission om ON om.id = b.ordre_mission_id
       JOIN chantiers c ON c.id = om.chantier_id
       WHERE b.statut IN ('ouvert','en_cours')
       UNION ALL
       SELECT 'pointage' AS type, 'moyenne' AS priorite,
              u.prenom || ' ' || u.nom || ' — ' ||
                CASE jp.type_pointage WHEN 'arrivee' THEN 'Arrivée' ELSE 'Départ' END AS message,
              c.nom_chantier, TO_CHAR(jp.horodatage,'YYYY-MM-DD HH24:MI') AS moment
       FROM journal_pointage_gps jp
       JOIN utilisateurs u ON u.id = jp.utilisateur_id
       JOIN ordres_de_mission om ON om.id = jp.ordre_mission_id
       JOIN chantiers c ON c.id = om.chantier_id
       ORDER BY moment DESC LIMIT 20`
    );
    res.json(rows);
  });

  // ─── NOTIFICATIONS RETARD (pour El Ghani) ────────────────────────
  router.get('/retards', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT nr.id, nr.motif, nr.etape_id, nr.photo_url, nr.lue,
              c.nom_chantier, e.nom AS equipe_nom, om.phase,
              TO_CHAR(nr.date_creation,'YYYY-MM-DD HH24:MI') AS moment
       FROM notifications_retard nr
       JOIN chantiers c ON c.id = nr.chantier_id
       JOIN equipes e ON e.id = nr.equipe_id
       JOIN ordres_de_mission om ON om.id = nr.mission_id
       ORDER BY nr.date_creation DESC LIMIT 30`
    );
    res.json(rows);
  });

  // PATCH /api/admin/retards/:id/lue — marquer comme lue
  router.patch('/retards/:id/lue', async (req: any, res) => {
    await pool.query(`UPDATE notifications_retard SET lue = TRUE WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Notification marquée comme lue.' });
  });

  return router;
}
