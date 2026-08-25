import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';
import { SmsService } from '../services/sms/sms.service';
import { eventBus } from '../services/events/event-bus';

export function creerAdminRouter(pool: Pool, logger: LoggerService, smsService?: SmsService): Router {
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
      const hasCoords = d.latitude != null && d.longitude != null;
      const chantierResult = await pool.query(
        `INSERT INTO chantiers
           (reference_commande_erp, nom_chantier, adresse, coordonnees,
            client_nom, client_telephone, statut,
            complexite, dxf_url, pdf_url, fiche_technique)
         VALUES ($1, $2, $3, ${hasCoords ? 'ST_SetSRID(ST_MakePoint($4, $5), 4326)' : 'NULL'}, $6, $7, 'planifie', $8, $9, $10, $11)
         RETURNING id`,
        [d.reference_commande_erp, d.nom_chantier, d.adresse_chantier,
         hasCoords ? d.longitude : null, hasCoords ? d.latitude : null,
         d.client_nom, d.client_telephone,
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

        // 📲 SMS à l'équipe mécanique assignée
        try {
          const telRes = await pool.query(
            `SELECT telephone FROM utilisateurs WHERE equipe_id = $1 AND actif = TRUE
               AND telephone IS NOT NULL AND telephone <> '' ORDER BY date_creation LIMIT 1`,
            [equipe.id]
          );
          await smsService?.notifierNouvelleMission({
            equipeId: equipe.id, equipeNom: equipe.nom,
            telephone: telRes.rows[0]?.telephone || null,
            phase: 'mecanique', chantierNom: d.nom_chantier, adresse: d.adresse_chantier || null,
            chantierId: chantierId, missionId: missionId,
          });
        } catch (smsErr) {
          logger.error('Erreur programmation SMS approbation', { erreur: (smsErr as any).message });
        }
      }

      logger.info('Demande approuvée → Chantier + Mission', {
        demandeId: d.id, chantierId, equipe: missionInfo.equipeNom,
      });

      // 📡 SSE: Broadcast chantier creation + team assignment
      eventBus.emit('chantier_cree', {
        chantierId,
        nom: d.nom_chantier,
        client: d.client_nom,
        adresse: d.adresse_chantier,
        complexite: d.complexite || 'MOYENNE',
        referenceERP: d.reference_commande_erp,
      });

      if (missionInfo.equipeId) {
        eventBus.emit('mission_assignee', {
          missionId: missionInfo.missionId,
          chantierId,
          equipeId: missionInfo.equipeId,
          equipeNom: missionInfo.equipeNom,
          chantierNom: d.nom_chantier,
          phase: 'mecanique',
        });
      }

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

  // ─── STATS DASHBOARD — 1 seule requête au lieu de 5 ──────────────
  router.get('/stats', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM chantiers) AS chantiers_total,
         (SELECT COUNT(*) FROM chantiers WHERE statut='en_cours') AS chantiers_actifs,
         (SELECT COUNT(*) FROM chantiers WHERE statut::text IN ('suspendu','bloque')) AS chantiers_bloques,
         (SELECT COUNT(*) FROM ordres_de_mission) AS missions_total,
         (SELECT COUNT(*) FROM ordres_de_mission WHERE statut='en_cours') AS missions_en_cours,
         (SELECT COUNT(*) FROM demandes_integration WHERE statut='EN_ATTENTE_VALIDATION') AS demandes_attente,
         (SELECT COUNT(*) FROM blocages_et_requisitions WHERE statut='ouvert') AS blocages_ouverts,
         (SELECT COUNT(*) FROM blocages_et_requisitions) AS blocages_total,
         (SELECT COUNT(*) FROM equipes WHERE statut_equipe='DISPONIBLE') AS equipes_dispo`
    );
    const r = rows[0];
    res.json({
      chantiersActifs: Number(r.chantiers_actifs),
      chantiersBloques: Number(r.chantiers_bloques),
      chantiersTotal: Number(r.chantiers_total),
      missionsEnCours: Number(r.missions_en_cours),
      missionsTotal: Number(r.missions_total),
      demandesEnAttente: Number(r.demandes_attente),
      blocagesOuverts: Number(r.blocages_ouverts),
      blocagesTotal: Number(r.blocages_total),
      equipesDisponibles: Number(r.equipes_dispo),
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

  // ─── JOURNAL SMS (file d'attente + envois) ──────────────────────────
  router.get('/sms', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.id, s.telephone, s.destinataire_nom, s.contenu, s.type_evenement,
                s.statut, s.tentative, s.fournisseur, s.erreur,
                c.nom_chantier, e.nom AS equipe_nom,
                TO_CHAR(s.date_creation,'YYYY-MM-DD HH24:MI:SS') AS cree,
                TO_CHAR(s.date_envoi,'YYYY-MM-DD HH24:MI:SS') AS envoye
         FROM sms_outbox s
         LEFT JOIN chantiers c ON c.id = s.chantier_id
         LEFT JOIN equipes e ON e.id = s.equipe_id
         ORDER BY s.date_creation DESC LIMIT 50`
      );
      const provider = smsService?.provider.nom ?? 'inconnu';
      res.json({ fournisseur: provider, sms: rows });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── TÉLÉPHONES — liste équipes + utilisateurs ──────────────────────
  router.get('/telephones', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT e.id AS equipe_id, e.nom AS equipe_nom, e.type,
                u.id AS utilisateur_id, u.prenom, u.nom, u.telephone, u.role, u.actif
         FROM equipes e
         LEFT JOIN utilisateurs u ON u.equipe_id = e.id
         WHERE e.actif = TRUE
         ORDER BY e.type, e.nom, u.actif DESC, u.prenom`
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── TÉLÉPHONES — mise à jour en masse ──────────────────────────────
  router.put('/telephones', async (req, res) => {
    try {
      const lignes: { utilisateur_id: string; telephone: string | null }[] = req.body?.lignes ?? [];
      if (lignes.length === 0) return res.status(400).json({ erreur: 'lignes requis.' });

      for (const l of lignes) {
        if (!l.utilisateur_id) continue;
        const tel = l.telephone ? l.telephone.replace(/[^\d+]/g, '') : null;
        await pool.query(`UPDATE utilisateurs SET telephone = $1, date_modification = NOW() WHERE id = $2`, [tel, l.utilisateur_id]);
      }
      logger.info('Téléphones mis à jour', { nb: lignes.length });
      res.json({ message: `${lignes.length} numéro(s) mis à jour.` });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── RÉASSIGNER UNE ÉQUIPE À UN CHANTIER ─────────────────────────
  router.patch('/chantiers/:id/reassign', async (req: any, res) => {
    try {
      const { equipe_id } = req.body;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      // Vérifier que le chantier existe
      const chantierRes = await pool.query(
        `SELECT id, nom_chantier FROM chantiers WHERE id = $1`, [req.params.id]
      );
      if (chantierRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Chantier introuvable.' });
      }
      const chantier = chantierRes.rows[0];

      // Vérifier que la nouvelle équipe existe
      const equipeRes = await pool.query(
        `SELECT id, nom, type FROM equipes WHERE id = $1 AND actif = TRUE`, [equipe_id]
      );
      if (equipeRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Équipe introuvable ou inactive.' });
      }
      const nouvelleEquipe = equipeRes.rows[0];

      // Trouver la mission active (en_attente ou en_cours) pour ce chantier
      const missionRes = await pool.query(
        `SELECT om.id, om.equipe_id, om.phase, om.statut, e.nom AS ancienne_equipe_nom
         FROM ordres_de_mission om
         LEFT JOIN equipes e ON e.id = om.equipe_id
         WHERE om.chantier_id = $1 AND om.statut IN ('en_attente', 'en_cours')
         ORDER BY om.date_creation DESC LIMIT 1`,
        [req.params.id]
      );

      if (missionRes.rows.length === 0) {
        return res.status(400).json({ erreur: 'Aucune mission active à réassigner.' });
      }
      const mission = missionRes.rows[0];

      // Réassigner la mission
      await pool.query(
        `UPDATE ordres_de_mission SET equipe_id = $1, notes = COALESCE(notes, '') || E'\nRéassigné par admin le ' || NOW()::TEXT || ' (ancienne équipe: ' || COALESCE($3, 'N/A') || ')'
         WHERE id = $2`,
        [equipe_id, mission.id, mission.ancienne_equipe_nom]
      );

      // Mettre à jour les statuts des équipes
      // Ancienne équipe → DISPONIBLE (si plus aucune mission active)
      if (mission.equipe_id) {
        const otherMissions = await pool.query(
          `SELECT 1 FROM ordres_de_mission WHERE equipe_id = $1 AND statut IN ('en_cours', 'en_attente') AND id != $2 LIMIT 1`,
          [mission.equipe_id, mission.id]
        );
        if (otherMissions.rows.length === 0) {
          await pool.query(
            `UPDATE equipes SET statut_equipe = 'DISPONIBLE' WHERE id = $1`,
            [mission.equipe_id]
          );
        }
      }

      // Nouvelle équipe → EN_MISSION
      await pool.query(
        `UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`,
        [equipe_id]
      );

      // 📲 SMS à la nouvelle équipe
      try {
        const telRes = await pool.query(
          `SELECT telephone FROM utilisateurs WHERE equipe_id = $1 AND actif = TRUE
             AND telephone IS NOT NULL AND telephone <> '' ORDER BY date_creation LIMIT 1`,
          [equipe_id]
        );
        await smsService?.notifierNouvelleMission({
          equipeId: nouvelleEquipe.id, equipeNom: nouvelleEquipe.nom,
          telephone: telRes.rows[0]?.telephone || null,
          phase: mission.phase || 'mecanique',
          chantierNom: chantier.nom_chantier, adresse: null,
          chantierId: chantier.id, missionId: mission.id,
        });
      } catch (smsErr) {
        logger.error('Erreur SMS réassignation', { erreur: (smsErr as any).message });
      }

      logger.info('Équipe réassignée', {
        chantierId: chantier.id, missionId: mission.id,
        ancienneEquipe: mission.ancienne_equipe_nom, nouvelleEquipe: nouvelleEquipe.nom,
      });

      // SSE: Broadcast
      eventBus.emit('mission_assignee', {
        missionId: mission.id,
        chantierId: chantier.id,
        equipeId: nouvelleEquipe.id,
        equipeNom: nouvelleEquipe.nom,
        chantierNom: chantier.nom_chantier,
        phase: mission.phase,
      });

      res.json({
        message: `✅ Équipe changée : ${nouvelleEquipe.nom} assignée à "${chantier.nom_chantier}"`,
        ancienneEquipe: mission.ancienne_equipe_nom,
        nouvelleEquipe: nouvelleEquipe.nom,
      });
    } catch (err: any) {
      logger.error('Erreur réassignation', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
