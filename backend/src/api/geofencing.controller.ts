import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { LoggerService } from '../services/notifications/logger.service';
import { distanceHaversine } from '../services/geocalcul/calculs-geo';

export function creerGeofencingRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();

  /**
   * POST /api/geofencing/position
   * Le technicien envoie sa position périodiquement (toutes les 30s)
   * Si hors zone → enregistre le suivi + déclenche alerte après 10 min
   */
  router.post('/position', async (req, res) => {
    try {
      const { missionId, technicienId, latitude, longitude } = req.body;
      if (!missionId || !technicienId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ erreur: 'Champs requis.' });
      }

      // Récupérer la mission + chantier + zone
      const missionRes = await pool.query(
        `SELECT om.id, om.chantier_id, c.rayon_geofencing AS rayon,
                ST_X(c.coordonnees::geometry) AS lat, ST_Y(c.coordonnees::geometry) AS lng,
                c.nom_chantier
         FROM ordres_de_mission om
         JOIN chantiers c ON c.id = om.chantier_id
         WHERE om.id = $1 AND om.statut = 'en_cours'`,
        [missionId]
      );
      if (missionRes.rows.length === 0) {
        return res.status(200).json({ dansZone: true, message: 'Mission non active.' });
      }

      const m = missionRes.rows[0];
      const rayon = parseFloat(m.rayon) || 100;
      const distance = distanceHaversine(latitude, longitude, parseFloat(m.lat), parseFloat(m.lng));
      const dansZone = distance <= rayon;

      // Enregistrer le suivi
      await pool.query(
        `INSERT INTO suivis_position_technicien (mission_id, technicien_id, latitude, longitude, dans_zone)
         VALUES ($1, $2, $3, $4, $5)`,
        [missionId, technicienId, latitude, longitude, dansZone]
      );

      // Si hors zone → vérifier s'il existe une alerte ouverte depuis > 10 min
      if (!dansZone) {
        const alerteRes = await pool.query(
          `SELECT id, date_sortie FROM alertes_zone
           WHERE mission_id = $1 AND est_resolue = FALSE AND type = 'SORTIE_ZONE'
           ORDER BY date_sortie DESC LIMIT 1`,
          [missionId]
        );

        if (alerteRes.rows.length > 0) {
          const alerte = alerteRes.rows[0];
          const sortieDepuis = (Date.now() - new Date(alerte.date_sortie).getTime()) / 60000;

          // Déjà > 10 min hors zone → notifier l'admin
          if (sortieDepuis >= 10 && !alerteRes.rows[0].lue) {
            await pool.query(`UPDATE alertes_zone SET lue = TRUE WHERE id = $1`, [alerte.id]);
            logger.warn('⚠️ TECHNICIEN HORS ZONE > 10 min', {
              chantier: m.nom_chantier, distance: Math.round(distance), technicienId,
            });
            return res.status(200).json({
              dansZone: false,
              alerte: true,
              message: `Hors zone depuis ${Math.round(sortieDepuis)} min — admin notifié.`,
            });
          }
        } else {
          // Première sortie → créer l'alerte (timer 10 min démarre)
          await pool.query(
            `INSERT INTO alertes_zone (mission_id, chantier_id, technicien_id, type, message)
             VALUES ($1, $2, $3, 'SORTIE_ZONE', $4)`,
            [missionId, m.chantier_id, technicienId,
             `Technicien sorti de la zone du chantier "${m.nom_chantier}" (${Math.round(distance)}m)`]
          );
          logger.warn('Technicien hors zone — timer 10 min démarré', { distance: Math.round(distance) });
        }
      } else {
        // Dans la zone → résoudre les alertes ouvertes
        await pool.query(
          `UPDATE alertes_zone SET est_resolue = TRUE, date_retour = NOW()
           WHERE mission_id = $1 AND est_resolue = FALSE`,
          [missionId]
        );
      }

      res.json({ dansZone, distance: Math.round(distance), rayon });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  /**
   * GET /api/geofencing/alertes?lue=false — alertes pour l'admin
   */
  router.get('/alertes', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT az.id, az.message, az.type, az.est_resolue, az.lue, az.date_sortie,
                c.nom_chantier, e.nom AS equipe_nom, u.prenom || ' ' || u.nom AS technicien
         FROM alertes_zone az
         JOIN chantiers c ON c.id = az.chantier_id
         JOIN equipes e ON e.id = (SELECT equipe_id FROM ordres_de_mission WHERE id = az.mission_id)
         JOIN utilisateurs u ON u.id = az.technicien_id
         WHERE az.est_resolue = FALSE
         ORDER BY az.date_sortie DESC LIMIT 20`
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  /**
   * GET /api/geofencing/roadmap/:chantierId — roadmap phases du chantier
   */
  router.get('/roadmap/:chantierId', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT rc.phase, rc.statut, rc.date_debut, rc.date_fin,
                e.nom AS equipe_nom, e.type AS equipe_type
         FROM roadmap_chantier rc
         LEFT JOIN equipes e ON e.id = rc.equipe_id
         WHERE rc.chantier_id = $1 ORDER BY rc.date_creation`,
        [req.params.chantierId]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
