import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { validerCoordonnees } from '../services/geocalcul/calculs-geo';
import { LoggerService } from '../services/notifications/logger.service';
import { EquipeRepository } from '../repositories/equipe.repository';
import { BlocageService } from '../services/moduleC/blocage.service';
import { NotificationService } from '../services/notifications/notification.service';

export function creerMissionRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();

  // GET /api/mission/active?equipe_id=
  router.get('/active', async (req, res) => {
    try {
      const { equipe_id } = req.query;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      const { rows } = await pool.query(
        `SELECT om.id, c.nom_chantier AS chantier, c.adresse, c.client_nom, c.client_telephone,
                c.reference_commande_erp AS ref_erp, om.phase, om.statut, om.equipe_id, e.nom AS equipe_nom,
                ST_X(c.coordonnees::geometry) AS latitude, ST_Y(c.coordonnees::geometry) AS longitude,
                c.rayon_geofencing, om.duree_estimee_jours AS duree_estimee,
                TO_CHAR(om.date_declenchement,'YYYY-MM-DD HH24:MI') AS date_declenchement,
                TO_CHAR(om.date_debut_effectif,'YYYY-MM-DD HH24:MI') AS date_debut
         FROM ordres_de_mission om
         JOIN chantiers c ON c.id = om.chantier_id
         JOIN equipes e ON e.id = om.equipe_id
         WHERE om.equipe_id = $1 AND om.statut IN ('en_attente','en_cours','bloque')
         ORDER BY om.date_creation DESC LIMIT 1`,
        [equipe_id]
      );

      if (rows.length === 0) return res.json(null);
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // POST /api/mission/pointage
  router.post('/pointage', async (req, res) => {
    try {
      const { missionId, technicienId, type, latitude, longitude } = req.body;
      if (!missionId || !technicienId || !type || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ erreur: 'Champs requis manquants.' });
      }
      validerCoordonnees(latitude, longitude);

      // Vérifier la mission
      const mission = await pool.query(`SELECT id, statut, chantier_id FROM ordres_de_mission WHERE id = $1`, [missionId]);
      if (mission.rows.length === 0) return res.status(404).json({ erreur: 'Mission introuvable.' });

      // Si arrivée, mettre la mission en cours
      if (type === 'arrivee' && mission.rows[0].statut === 'en_attente') {
        await pool.query(`UPDATE ordres_de_mission SET statut = 'en_cours', date_debut_effectif = NOW() WHERE id = $1`, [missionId]);
      }

      const { rows } = await pool.query(
        `INSERT INTO journal_pointage_gps (ordre_mission_id, utilisateur_id, type_pointage, horodatage, position_gps)
         VALUES ($1, $2, $3, NOW(), ST_SetSRID(ST_MakePoint($4, $5), 4326))
         RETURNING id, type_pointage AS "type", horodatage, distance_chantier_m AS distance, dans_rayon AS conforme`,
        [missionId, technicienId, type, longitude, latitude]
      );

      logger.info(`Pointage ${type} enregistré`, { missionId, technicienId });

      // Si départ, terminer la mission
      if (type === 'depart') {
        await pool.query(
          `UPDATE ordres_de_mission SET statut = 'termine', date_fin_effectif = NOW() WHERE id = $1`,
          [missionId]
        );
        logger.info('Mission terminée', { missionId });
      }

      res.status(201).json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message, detail: err?.detail });
    }
  });

  // GET /api/mission/:id/pointages
  router.get('/:id/pointages', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, type_pointage AS "type", TO_CHAR(horodatage,'YYYY-MM-DD HH24:MI:SS') AS horodatage,
                distance_chantier_m AS distance, dans_rayon AS conforme
         FROM journal_pointage_gps WHERE ordre_mission_id = $1
         ORDER BY horodatage DESC`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // POST /api/mission/blocage
  router.post('/blocage', async (req, res) => {
    try {
      const { missionId, declarePar, raison, idPieceERP, priorite } = req.body;
      if (!missionId || !declarePar || !raison) {
        return res.status(400).json({ erreur: 'missionId, declarePar et raison requis.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO blocages_et_requisitions (ordre_mission_id, declare_par, raison_blocage, id_piece_erp, priorite, statut)
         VALUES ($1, $2, $3, $4, $5, 'ouvert')
         RETURNING id`,
        [missionId, declarePar, raison, idPieceERP || null, priorite || 'moyenne']
      );

      // Bloquer la mission
      await pool.query(`UPDATE ordres_de_mission SET statut = 'bloque' WHERE id = $1`, [missionId]);

      logger.warn('Blocage signalé depuis mobile', { blocageId: rows[0].id, missionId });

      res.status(201).json({ id: rows[0].id, message: 'Blocage signalé.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
