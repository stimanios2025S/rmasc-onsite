import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';
import { SmsService } from '../services/sms/sms.service';
import { eventBus } from '../services/events/event-bus';
import { reposActif, sweepReposExpires, joursRestants, cloturerRepos } from '../services/repos-chantier.service';

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
           AND (e.disponible_a_partir_de IS NULL OR e.disponible_a_partir_de <= NOW())
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
                ELSE 0 END AS jours_repos_restants,
              (SELECT STRING_AGG(TRIM(COALESCE(u.prenom,'') || ' ' || COALESCE(u.nom,'')), ', ')
               FROM utilisateurs u WHERE u.equipe_id = e.id AND u.actif = TRUE) AS membres_noms
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
      `SELECT 'blocage' AS type, b.priorite::text AS priorite, b.raison_blocage AS message,
              c.nom_chantier, e.nom AS equipe_nom,
              TO_CHAR(b.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
              b.photo_proof_url AS photo_url, b.ordre_mission_id AS mission_id, b.id AS blocage_id
       FROM blocages_et_requisitions b
       JOIN ordres_de_mission om ON om.id = b.ordre_mission_id
       JOIN chantiers c ON c.id = om.chantier_id
       LEFT JOIN equipes e ON e.id = om.equipe_id
       WHERE b.statut IN ('ouvert','en_cours')
       UNION ALL
       SELECT 'pause' AS type, 'basse'::text AS priorite,
              p.type_pause || ' — ' || COALESCE(e2.nom, 'Équipe') AS message,
              COALESCE(c2.nom_chantier, 'N/A') AS nom_chantier,
              e2.nom AS equipe_nom,
              TO_CHAR(p.date_debut,'YYYY-MM-DD HH24:MI') AS moment,
              NULL AS photo_url, p.mission_id, NULL AS blocage_id
       FROM pauses_journee p
       LEFT JOIN equipes e2 ON e2.id = p.equipe_id
       LEFT JOIN ordres_de_mission om2 ON om2.id = p.mission_id
       LEFT JOIN chantiers c2 ON c2.id = om2.chantier_id
       WHERE p.date_fin IS NULL AND p.date_debut > NOW() - INTERVAL '7 days'
       UNION ALL
       SELECT 'reprise' AS type, 'basse'::text AS priorite,
              'Reprise du travail — ' || COALESCE(e3.nom, 'Équipe') || COALESCE(' (' || pr.type_pause || ')', '') AS message,
              COALESCE(c3.nom_chantier, 'N/A') AS nom_chantier,
              e3.nom AS equipe_nom,
              TO_CHAR(pr.date_fin,'YYYY-MM-DD HH24:MI') AS moment,
              NULL AS photo_url, pr.mission_id, NULL AS blocage_id
       FROM pauses_journee pr
       LEFT JOIN equipes e3 ON e3.id = pr.equipe_id
       LEFT JOIN ordres_de_mission om3 ON om3.id = pr.mission_id
       LEFT JOIN chantiers c3 ON c3.id = om3.chantier_id
       WHERE pr.date_fin IS NOT NULL AND pr.date_fin > NOW() - INTERVAL '24 hours'
       UNION ALL
       SELECT 'materiel' AS type, 'moyenne'::text AS priorite,
              dm.description AS message,
              COALESCE(c4.nom_chantier, 'N/A') AS nom_chantier,
              e4.nom AS equipe_nom,
              TO_CHAR(dm.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
              dm.photo_url, dm.mission_id, NULL AS blocage_id
       FROM demandes_materiel dm
       LEFT JOIN equipes e4 ON e4.id = dm.equipe_id
       LEFT JOIN chantiers c4 ON c4.id = dm.chantier_id
       WHERE dm.type_demande = 'materiel' AND dm.statut IN ('EN_ATTENTE','EN_PREPARATION','EXPEDIE')
       UNION ALL
       SELECT 'retard' AS type, 'haute'::text AS priorite,
              nr.motif AS message,
              c.nom_chantier, e.nom AS equipe_nom,
              TO_CHAR(nr.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
              nr.photo_url, nr.mission_id, NULL AS blocage_id
       FROM notifications_retard nr
       JOIN chantiers c ON c.id = nr.chantier_id
       JOIN equipes e ON e.id = nr.equipe_id
       UNION ALL
       SELECT 'pointage' AS type, 'basse'::text AS priorite,
              u.prenom || ' ' || u.nom || ' — ' ||
                CASE jp.type_pointage WHEN 'arrivee' THEN 'Arrivée' ELSE 'Départ' END AS message,
              c.nom_chantier, e.nom AS equipe_nom,
              TO_CHAR(jp.horodatage,'YYYY-MM-DD HH24:MI') AS moment,
              NULL AS photo_url, jp.ordre_mission_id AS mission_id, NULL AS blocage_id
       FROM journal_pointage_gps jp
       JOIN utilisateurs u ON u.id = jp.utilisateur_id
       JOIN ordres_de_mission om ON om.id = jp.ordre_mission_id
       JOIN chantiers c ON c.id = om.chantier_id
       LEFT JOIN equipes e ON e.id = om.equipe_id
       WHERE jp.horodatage > NOW() - INTERVAL '7 days'
         AND NOT (jp.type_pointage = 'depart' AND COALESCE(jp.source, 'manuel') = 'auto_gps')
       UNION ALL
       SELECT 'sortie_auto' AS type, 'haute'::text AS priorite,
              '🚶 Sortie auto GPS (sans pause) — ' || u.prenom || ' ' || u.nom AS message,
              c.nom_chantier, e.nom AS equipe_nom,
              TO_CHAR(jp.horodatage,'YYYY-MM-DD HH24:MI') AS moment,
              NULL AS photo_url, jp.ordre_mission_id AS mission_id, NULL AS blocage_id
       FROM journal_pointage_gps jp
       JOIN utilisateurs u ON u.id = jp.utilisateur_id
       JOIN ordres_de_mission om ON om.id = jp.ordre_mission_id
       JOIN chantiers c ON c.id = om.chantier_id
       LEFT JOIN equipes e ON e.id = om.equipe_id
       WHERE jp.type_pointage = 'depart' AND COALESCE(jp.source, 'manuel') = 'auto_gps'
         AND jp.horodatage > NOW() - INTERVAL '7 days'
       UNION ALL
       SELECT 'pointage_jour' AS type, 'basse'::text AS priorite,
              CASE pj.type_pointage
                WHEN 'matinal' THEN '🌅 Pointage matinal — ' || COALESCE(eq.nom, 'Équipe')
                WHEN 'fin_journee' THEN '🌙 Fin de journée — ' || COALESCE(eq.nom, 'Équipe')
                ELSE pj.type_pointage || ' — ' || COALESCE(eq.nom, 'Équipe')
              END AS message,
              COALESCE(c2.nom_chantier, 'N/A') AS nom_chantier,
              eq.nom AS equipe_nom,
              TO_CHAR(pj.horodatage,'YYYY-MM-DD HH24:MI') AS moment,
              NULL AS photo_url, pj.mission_id, NULL AS blocage_id
       FROM pointages_jour pj
       LEFT JOIN equipes eq ON eq.id = pj.equipe_id
       LEFT JOIN ordres_de_mission om2 ON om2.id = pj.mission_id
       LEFT JOIN chantiers c2 ON c2.id = om2.chantier_id
       WHERE pj.horodatage > NOW() - INTERVAL '7 days'
       ORDER BY moment DESC LIMIT 50`
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

  // ─── REPOS CHANTIER — mettre une équipe en repos sur un chantier ──
  // POST /api/admin/chantiers/:id/repos { equipe_id, jours, motif? }
  router.post('/chantiers/:id/repos', async (req: any, res) => {
    try {
      const chantierId = req.params.id;
      const { equipe_id, jours, motif } = req.body;
      const nbJours = Number(jours);
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });
      if (!Number.isFinite(nbJours) || nbJours < 1 || nbJours > 90) {
        return res.status(400).json({ erreur: 'jours doit être entre 1 et 90.' });
      }

      const chantierRes = await pool.query(
        `SELECT id, nom_chantier FROM chantiers WHERE id = $1`, [chantierId]
      );
      if (chantierRes.rows.length === 0) return res.status(404).json({ erreur: 'Chantier introuvable.' });
      const chantier = chantierRes.rows[0];

      const equipeRes = await pool.query(
        `SELECT id, nom, statut_equipe FROM equipes WHERE id = $1 AND actif = TRUE`, [equipe_id]
      );
      if (equipeRes.rows.length === 0) return res.status(404).json({ erreur: 'Équipe introuvable ou inactive.' });
      const equipe = equipeRes.rows[0];

      // Déjà en repos sur ce chantier ?
      const existant = await reposActif(pool, chantierId, equipe_id);
      if (existant.actif) {
        return res.status(409).json({ erreur: `« ${equipe.nom} » est déjà en repos sur ce chantier.` });
      }

      // Missions actives de cette équipe SUR CE chantier → en_pause (snapshot)
      const { rows: missions } = await pool.query(
        `SELECT id, phase::text AS phase, statut::text AS statut
         FROM ordres_de_mission
         WHERE chantier_id = $1 AND equipe_id = $2
           AND statut IN ('en_attente','en_route','en_cours','en_pause','bloque')`,
        [chantierId, equipe_id]
      );
      const snaps = missions
        .filter(m => m.statut !== 'en_pause')
        .map(m => ({ id: m.id, phase: m.phase, ancien_statut: m.statut }));
      if (missions.length > 0) {
        await pool.query(
          `UPDATE ordres_de_mission SET statut = 'en_pause', date_modification = NOW()
           WHERE chantier_id = $1 AND equipe_id = $2
             AND statut IN ('en_attente','en_route','en_cours','en_pause','bloque')`,
          [chantierId, equipe_id]
        );
      }

      // Équipe → EN_REPOS jusqu'à NOW()+N jours
      const finPrevueRes = await pool.query(`SELECT NOW() + ($1 || ' days')::INTERVAL AS fin`, [nbJours]);
      const finPrevue = finPrevueRes.rows[0].fin;
      await pool.query(
        `UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = $2,
                date_modification = NOW() WHERE id = $1`,
        [equipe_id, finPrevue]
      );

      // Planning décalé de +N jours (dates futures uniquement + date_echeance)
      await pool.query(
        `UPDATE chantiers SET
           date_debut_mecanique = CASE WHEN date_debut_mecanique IS NOT NULL AND date_debut_mecanique > NOW() THEN date_debut_mecanique + ($2 || ' days')::INTERVAL ELSE date_debut_mecanique END,
           date_debut_electrique = CASE WHEN date_debut_electrique IS NOT NULL AND date_debut_electrique > NOW() THEN date_debut_electrique + ($2 || ' days')::INTERVAL ELSE date_debut_electrique END,
           date_debut_verification = CASE WHEN date_debut_verification IS NOT NULL AND date_debut_verification > NOW() THEN date_debut_verification + ($2 || ' days')::INTERVAL ELSE date_debut_verification END,
           date_echeance = CASE WHEN date_echeance IS NOT NULL AND date_echeance > NOW() THEN date_echeance + ($2 || ' days')::INTERVAL ELSE date_echeance END,
           date_modification = NOW()
         WHERE id = $1`,
        [chantierId, nbJours]
      );
      // Missions en attente re-synchronisées (jamais les démarrées)
      await pool.query(
        `UPDATE ordres_de_mission SET date_declenchement = date_declenchement + ($2 || ' days')::INTERVAL
         WHERE chantier_id = $1 AND statut = 'en_attente' AND date_declenchement IS NOT NULL AND date_declenchement > NOW()`,
        [chantierId, nbJours]
      );

      const { rows: reposRows } = await pool.query(
        `INSERT INTO repos_chantier (chantier_id, equipe_id, missions, jours_prevus, date_fin_prevue, motif, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [chantierId, equipe_id, JSON.stringify(snaps), nbJours, finPrevue, motif || null, req.user?.userId || null]
      );

      logger.info('Repos chantier démarré', {
        chantierId, equipe: equipe.nom, jours: nbJours, missionsMisesEnPause: missions.length,
      });
      eventBus.emit('repos_chantier', {
        action: 'demarre', reposId: reposRows[0].id,
        chantierId, chantierNom: chantier.nom_chantier,
        equipeId: equipe_id, equipeNom: equipe.nom, jours: nbJours,
        message: `😴 Repos ${nbJours}j — ${equipe.nom} sur "${chantier.nom_chantier}"`,
      });

      res.status(201).json({
        ok: true, repos_id: reposRows[0].id, fin_prevue: finPrevue,
        missions_mises_en_pause: missions.length,
        message: `😴 « ${equipe.nom} » en repos ${nbJours} jour${nbJours > 1 ? 's' : ''} sur « ${chantier.nom_chantier} ». Planning décalé de ${nbJours}j.`,
      });
    } catch (err: any) {
      logger.error('Erreur démarrage repos chantier', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // GET /api/admin/chantiers/:id/repos — repos actifs + historique
  router.get('/chantiers/:id/repos', async (req, res) => {
    try {
      await sweepReposExpires(pool);
      const { rows } = await pool.query(
        `SELECT rc.id, rc.chantier_id, rc.equipe_id, e.nom AS equipe_nom, e.type::text AS equipe_type,
                rc.missions, rc.jours_prevus,
                TO_CHAR(rc.date_debut,'YYYY-MM-DD HH24:MI') AS date_debut,
                TO_CHAR(rc.date_fin_prevue,'YYYY-MM-DD HH24:MI') AS date_fin_prevue,
                TO_CHAR(rc.date_fin_effective,'YYYY-MM-DD HH24:MI') AS date_fin_effective,
                rc.statut, rc.motif,
                CASE WHEN rc.statut = 'actif' AND rc.date_fin_prevue > NOW()
                  THEN CEIL(EXTRACT(EPOCH FROM rc.date_fin_prevue - NOW()) / 86400)::INT
                  ELSE 0 END AS jours_restants
         FROM repos_chantier rc
         JOIN equipes e ON e.id = rc.equipe_id
         WHERE rc.chantier_id = $1
         ORDER BY (rc.statut = 'actif') DESC, rc.date_creation DESC`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // DELETE /api/admin/chantiers/:id/repos/:reposId — arrêter le repos (recalage auto)
  router.delete('/chantiers/:id/repos/:reposId', async (req, res) => {
    try {
      const { id: chantierId, reposId } = req.params;
      const { rows } = await pool.query(
        `SELECT rc.*, c.nom_chantier, e.nom AS equipe_nom
         FROM repos_chantier rc
         JOIN chantiers c ON c.id = rc.chantier_id
         JOIN equipes e ON e.id = rc.equipe_id
         WHERE rc.id = $1 AND rc.chantier_id = $2 AND rc.statut = 'actif'`,
        [reposId, chantierId]
      );
      if (rows.length === 0) return res.status(404).json({ erreur: 'Repos actif introuvable.' });
      const repos = rows[0];
      const missions = (typeof repos.missions === 'string' ? JSON.parse(repos.missions) : repos.missions) || [];

      // Recalage : on retire les jours RESTANTS du planning (pas les écoulés)
      const restants = joursRestants(repos.date_fin_prevue);
      if (restants > 0) {
        await pool.query(
          `UPDATE chantiers SET
             date_debut_mecanique = CASE WHEN date_debut_mecanique IS NOT NULL AND date_debut_mecanique > NOW() THEN date_debut_mecanique - ($2 || ' days')::INTERVAL ELSE date_debut_mecanique END,
             date_debut_electrique = CASE WHEN date_debut_electrique IS NOT NULL AND date_debut_electrique > NOW() THEN date_debut_electrique - ($2 || ' days')::INTERVAL ELSE date_debut_electrique END,
             date_debut_verification = CASE WHEN date_debut_verification IS NOT NULL AND date_debut_verification > NOW() THEN date_debut_verification - ($2 || ' days')::INTERVAL ELSE date_debut_verification END,
             date_echeance = CASE WHEN date_echeance IS NOT NULL AND date_echeance > NOW() THEN date_echeance - ($2 || ' days')::INTERVAL ELSE date_echeance END,
             date_modification = NOW()
           WHERE id = $1`,
          [chantierId, restants]
        );
        await pool.query(
          `UPDATE ordres_de_mission SET date_declenchement = date_declenchement - ($2 || ' days')::INTERVAL
           WHERE chantier_id = $1 AND statut = 'en_attente' AND date_declenchement IS NOT NULL AND date_declenchement > NOW()`,
          [chantierId, restants]
        );
      }

      await cloturerRepos(pool, reposId, missions, true);

      logger.info('Repos chantier arrêté', { reposId, chantierId, joursRetires: restants });
      eventBus.emit('repos_chantier', {
        action: 'arrete', reposId,
        chantierId, chantierNom: repos.nom_chantier,
        equipeId: repos.equipe_id, equipeNom: repos.equipe_nom,
        message: `▶️ Repos arrêté — ${repos.equipe_nom} reprend sur "${repos.nom_chantier}"`,
      });

      res.json({
        ok: true,
        message: `▶️ Repos de « ${repos.equipe_nom} » arrêté. Planning recalé de -${restants}j. Missions reprises.`,
      });
    } catch (err: any) {
      logger.error('Erreur arrêt repos chantier', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── RÉASSIGNER UNE ÉQUIPE À UN CHANTIER ─────────────────────────
  router.patch('/chantiers/:id/reassign', async (req: any, res) => {
    try {
      const { equipe_id, force } = req.body;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      // Vérifier que le chantier existe
      const chantierRes = await pool.query(
        `SELECT id, nom_chantier FROM chantiers WHERE id = $1`, [req.params.id]
      );
      if (chantierRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Chantier introuvable.' });
      }
      const chantier = chantierRes.rows[0];

      // Vérifier que la nouvelle équipe existe (accept EN_REPOS when force=true)
      const equipeRes = await pool.query(
        `SELECT id, nom, type, statut_equipe FROM equipes WHERE id = $1 AND actif = TRUE`, [equipe_id]
      );
      if (equipeRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Équipe introuvable ou inactive.' });
      }
      const nouvelleEquipe = equipeRes.rows[0];

      // Allow EN_REPOS teams only with force override
      if (nouvelleEquipe.statut_equipe === 'EN_REPOS' && !force) {
        return res.status(400).json({ erreur: 'Cette équipe est en repos. Utilisez force=true pour forcer l\'assignation.' });
      }

      // Garde repos-chantier : impossible d'assigner une équipe en repos ciblé sur ce chantier
      const gardeRepos = await reposActif(pool, req.params.id, equipe_id);
      if (gardeRepos.actif) {
        return res.status(409).json({ erreur: `« ${nouvelleEquipe.nom} » est en repos sur ce chantier. Arrêtez le repos d'abord.` });
      }

      // Trouver la mission active pour ce chantier (tous statuts actifs)
      const missionRes = await pool.query(
        `SELECT om.id, om.equipe_id, om.phase, om.statut, e.nom AS ancienne_equipe_nom
         FROM ordres_de_mission om
         LEFT JOIN equipes e ON e.id = om.equipe_id
         WHERE om.chantier_id = $1 AND om.statut IN ('en_attente', 'en_route', 'en_cours', 'en_pause', 'bloque')
         ORDER BY om.date_creation DESC LIMIT 1`,
        [req.params.id]
      );

      if (missionRes.rows.length === 0) {
        // No active mission — create the initial mecanique mission for this chantier
        try {
          const { rows: newMission } = await pool.query(
            `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_creation)
             VALUES ($1, $2, 'mecanique', 'en_attente', NOW())
             RETURNING id`,
            [req.params.id, equipe_id]
          );
          // Set team to EN_MISSION
          await pool.query(
            `UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`,
            [equipe_id]
          );
          // Update chantier statut
          await pool.query(
            `UPDATE chantiers SET statut = 'en_cours' WHERE id = $1`,
            [req.params.id]
          );
          return res.json({ message: `Équipe "${nouvelleEquipe.nom}" assignée au chantier. Mission mécanique créée.` });
        } catch (createErr: any) {
          return res.status(500).json({ erreur: 'Erreur création mission: ' + createErr.message });
        }
      }
      const mission = missionRes.rows[0];

      // Admin peut réassigner à tout moment (travail en cours, en pause, etc.)
      // Les raisons : maladie, indisponibilité, changement d'équipe, etc.

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
          `SELECT 1 FROM ordres_de_mission WHERE equipe_id = $1 AND statut IN ('en_cours', 'en_attente', 'en_route', 'en_pause', 'bloque') AND id != $2 LIMIT 1`,
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
