import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { LoggerService } from '../services/notifications/logger.service';
import { SmsService } from '../services/sms/sms.service';
import { eventBus } from '../services/events/event-bus';

/**
 * Tracking Controller — GPS en route, pointage jour, pause, transfert
 *
 * Endpoints:
 *   POST /api/tracking/gps          — Position GPS continue pendant trajet
 *   POST /api/tracking/pointage-jour — Pointage matinal / fin journée
 *   POST /api/tracking/pause         — Début/fin de pause ou retour shop
 *   POST /api/tracking/arrivee       — Confirmer arrivée sur site (GPS check)
 *   POST /api/tracking/transferer    — Transfert méca → élec
 *   GET  /api/tracking/equipes       — Positions temps réel (admin carte)
 *   GET  /api/tracking/journee       — Résumé journée d'une équipe
 */
export function creerTrackingRouter(pool: Pool, logger: LoggerService, smsService?: SmsService): Router {
  const router = Router();

  // ─── 1. GPS TRACKING — Position continue pendant trajet ──────────
  router.post('/gps', async (req, res) => {
    try {
      const { equipeId, missionId, latitude, longitude, vitesse, precision, batterie, timestamp } = req.body;
      if (!equipeId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ erreur: 'equipeId, latitude, longitude requis.' });
      }

      await pool.query(
        `INSERT INTO gps_tracking (equipe_id, mission_id, latitude, longitude, vitesse_kmh, precision_m, batterie_pct, timestamp_client)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [equipeId, missionId || null, latitude, longitude, vitesse || null, precision || null, batterie || null, timestamp || new Date().toISOString()]
      );

      // Broadcast position for live map
      eventBus.emit('equipe_position', {
        equipeId, latitude, longitude, vitesse, missionId,
        timestamp: timestamp || new Date().toISOString(),
      });

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 2. POINTAGE JOUR — Matinal / Fin journée (avec validation GPS) ──
  router.post('/pointage-jour', async (req, res) => {
    try {
      const { equipeId, missionId, type, latitude, longitude, notes } = req.body;
      if (!equipeId || !type) {
        return res.status(400).json({ erreur: 'equipeId et type requis.' });
      }
      if (!['matinal', 'fin_journee'].includes(type)) {
        return res.status(400).json({ erreur: 'type doit être matinal ou fin_journee.' });
      }
      if (!latitude || !longitude) {
        return res.status(400).json({ erreur: 'Position GPS requise. Activez la géolocalisation.' });
      }

      // For fin_journee: validate GPS is at the chantier
      if (type === 'fin_journee' && missionId) {
        const chantierRes = await pool.query(
          `SELECT c.nom_chantier,
                  CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS chantier_lat,
                  CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS chantier_lng,
                  c.rayon_geofencing
           FROM ordres_de_mission om JOIN chantiers c ON c.id = om.chantier_id
           WHERE om.id = $1`,
          [missionId]
        );
        if (chantierRes.rows.length > 0) {
          const c = chantierRes.rows[0];
          if (c.chantier_lat && c.chantier_lng) {
            const R = 6371000;
            const dLat = (latitude - c.chantier_lat) * Math.PI / 180;
            const dLng = (longitude - c.chantier_lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(c.chantier_lat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
            const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const rayon = parseFloat(c.rayon_geofencing) || 100;
            if (distance > rayon) {
              return res.status(403).json({
                erreur: false,
                autorise: false,
                distance: Math.round(distance),
                rayon: Math.round(rayon),
                message: `Vous êtes à ${Math.round(distance)}m du chantier "${c.nom_chantier}". Vous devez être sur le site pour terminer la journée (rayon: ${rayon}m).`,
              });
            }
          }
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO pointages_jour (equipe_id, mission_id, type_pointage, latitude, longitude, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, type_pointage AS "type", horodatage, distance_chantier_m AS distance, dans_rayon AS conforme`,
        [equipeId, missionId || null, type, latitude, longitude, notes || null]
      );

      logger.info(`Pointage jour ${type}`, { equipeId, conforme: rows[0]?.conforme });

      // Matinal: set mission to en_route so it persists across re-login
      if (type === 'matinal' && missionId) {
        await pool.query(
          `UPDATE ordres_de_mission SET statut = 'en_route', date_declenchement = COALESCE(date_declenchement, NOW())
           WHERE id = $1 AND statut = 'en_attente'`,
          [missionId]
        );
        // Also set team to EN_MISSION
        await pool.query(
          `UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1 AND statut_equipe = 'DISPONIBLE'`,
          [equipeId]
        );
      }

      // SSE broadcast
      if (type === 'matinal') {
        eventBus.emit('equipe_en_route', {
          equipeId, missionId, position: { latitude, longitude },
          message: 'Équipe en route vers le chantier',
        });
      } else {
        eventBus.emit('equipe_terminee', {
          equipeId, missionId,
          message: 'Équipe a terminé la journée',
        });
      }

      res.status(201).json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 3. PAUSE — Début/fin pause ou retour shop ──────────────────
  router.post('/pause', async (req, res) => {
    try {
      const { equipeId, missionId, action, type, motif } = req.body;
      // action: 'debut' | 'fin'
      // type: 'pause' | 'retour_shop'
      if (!equipeId || !action) {
        return res.status(400).json({ erreur: 'equipeId et action requis.' });
      }

      if (action === 'debut') {
        const { rows } = await pool.query(
          `INSERT INTO pauses_journee (equipe_id, mission_id, type_pause, motif)
           VALUES ($1, $2, $3, $4)
           RETURNING id, type_pause, date_debut`,
          [equipeId, missionId || null, type || 'pause', motif || null]
        );

        // Set mission to en_pause
        if (missionId) {
          await pool.query(`UPDATE ordres_de_mission SET statut = 'en_pause' WHERE id = $1 AND statut = 'en_cours'`, [missionId]);
        }

        eventBus.emit('equipe_en_pause', {
          equipeId, missionId, type: type || 'pause', motif,
          pauseId: rows[0].id,
        });

        logger.info(`Pause débutée`, { equipeId, type: type || 'pause' });
        res.status(201).json(rows[0]);
      } else {
        // Fin de pause
        const { rows } = await pool.query(
          `UPDATE pauses_journee SET date_fin = NOW()
           WHERE equipe_id = $1 AND date_fin IS NULL
           RETURNING id, type_pause, date_debut, date_fin, duree_minutes`,
          [equipeId]
        );

        // Restore mission to en_cours
        if (missionId && rows.length > 0) {
          await pool.query(`UPDATE ordres_de_mission SET statut = 'en_cours' WHERE id = $1 AND statut = 'en_pause'`, [missionId]);
        }

        eventBus.emit('equipe_reprise', {
          equipeId, missionId,
          pauseDuree: rows[0]?.duree_minutes || 0,
        });

        logger.info(`Pause terminée`, { equipeId, duree: rows[0]?.duree_minutes });
        res.json(rows[0] || { message: 'Aucune pause ouverte.' });
      }
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 4. ARRIVÉE — Confirmer arrivée sur chantier (GPS check) ────
  router.post('/arrivee', async (req, res) => {
    try {
      const { equipeId, missionId, technicienId, latitude, longitude } = req.body;
      if (!equipeId || !missionId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ erreur: 'equipeId, missionId, latitude, longitude requis.' });
      }

      // Get chantier coordinates + rayon
      const chantierRes = await pool.query(
        `SELECT c.id AS chantier_id, c.nom_chantier,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS chantier_lat,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS chantier_lng,
                c.rayon_geofencing
         FROM ordres_de_mission om JOIN chantiers c ON c.id = om.chantier_id
         WHERE om.id = $1`,
        [missionId]
      );

      if (chantierRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Mission introuvable.' });
      }

      const c = chantierRes.rows[0];
      let dansRayon = true; // Default: allow if no coordinates
      let distance = 0;

      if (c.chantier_lat && c.chantier_lng) {
        // Calculate distance
        const R = 6371000;
        const dLat = (latitude - c.chantier_lat) * Math.PI / 180;
        const dLng = (longitude - c.chantier_lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(c.chantier_lat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        dansRayon = distance <= (parseFloat(c.rayon_geofencing) || 100);
      }

      if (!dansRayon) {
        return res.status(200).json({
          autorise: false,
          distance: Math.round(distance),
          rayon: parseFloat(c.rayon_geofencing) || 100,
          message: `Vous êtes à ${Math.round(distance)}m du chantier "${c.nom_chantier}". Rapprochez-vous (rayon: ${c.rayon_geofencing}m).`,
        });
      }

      // Record the arrival pointage
      if (technicienId) {
        await pool.query(
          `INSERT INTO journal_pointage_gps (ordre_mission_id, utilisateur_id, type_pointage, horodatage, position_gps)
           VALUES ($1, $2, 'arrivee', NOW(), ST_SetSRID(ST_MakePoint($3, $4), 4326))`,
          [missionId, technicienId, longitude, latitude]
        );
      }

      // Update mission status to en_cours
      await pool.query(
        `UPDATE ordres_de_mission SET statut = 'en_cours', date_debut_effectif = COALESCE(date_debut_effectif, NOW()) WHERE id = $1 AND statut IN ('en_route','en_attente')`,
        [missionId]
      );

      // Update chantier to en_cours
      await pool.query(
        `UPDATE chantiers SET statut = 'en_cours' WHERE id = (SELECT chantier_id FROM ordres_de_mission WHERE id = $1) AND statut = 'planifie'`,
        [missionId]
      );

      logger.info('Arrivée confirmée', { equipeId, missionId, distance: Math.round(distance) });

      // SSE broadcast
      eventBus.emit('equipe_arrivee', {
        equipeId, missionId,
        chantierId: c.chantier_id, chantierNom: c.nom_chantier,
        distance: Math.round(distance),
      });

      res.json({
        ok: true,
        distance: Math.round(distance),
        dansRayon: true,
        message: `✅ Arrivée confirmée sur "${c.nom_chantier}" (${Math.round(distance)}m du point GPS)`,
      });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 5. TRANSFERT PHASE (Méca→Élec ou Élec→Vérification) ────────
  router.post('/transferer', async (req, res) => {
    try {
      const { missionId, equipeId } = req.body;
      if (!missionId) return res.status(400).json({ erreur: 'missionId requis.' });

      // Get current mission info
      const missionRes = await pool.query(
        `SELECT om.*, c.nom_chantier, c.id AS chantier_id, e.nom AS equipe_nom, e.type AS equipe_type
         FROM ordres_de_mission om
         JOIN chantiers c ON c.id = om.chantier_id
         JOIN equipes e ON e.id = om.equipe_id
         WHERE om.id = $1`,
        [missionId]
      );
      if (missionRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Mission introuvable.' });
      }
      const m = missionRes.rows[0];

      // Allow transfer from mecanique or electrique
      if (m.phase !== 'mecanique' && m.phase !== 'electrique') {
        return res.status(400).json({ erreur: 'Seules les phases mécanique et électrique peuvent être transférées.' });
      }

      // Determine next phase
      const nextPhase = m.phase === 'mecanique' ? 'electrique' : 'verification';
      const nextTeamType = nextPhase === 'electrique' ? 'electrique' : 'mixte';

      // Mark current mission as termine — this fires the DB trigger trg_mission_phase_suivante
      // which auto-creates the next phase mission + checklist. We just need to find it and send SMS.
      await pool.query(
        `UPDATE ordres_de_mission SET statut = 'termine', date_fin_effectif = NOW() WHERE id = $1`,
        [missionId]
      );

      // The DB trigger may have already created the next phase mission. Check first.
      let missionNextId: string | null = null;
      let equipeNextNom = 'Aucune';

      const existingNext = await pool.query(
        `SELECT om.id, e.nom AS equipe_nom
         FROM ordres_de_mission om
         LEFT JOIN equipes e ON e.id = om.equipe_id
         WHERE om.chantier_id = $1 AND om.phase = $2
           AND om.statut != 'termine'
         ORDER BY om.date_creation DESC LIMIT 1`,
        [m.chantier_id, nextPhase]
      );

      if (existingNext.rows.length > 0) {
        // Trigger already created it
        missionNextId = existingNext.rows[0].id;
        equipeNextNom = existingNext.rows[0].equipe_nom || 'Aucune';
        logger.info(`Transfert: mission ${nextPhase} créée par trigger`, { missionNextId, equipeNextNom });
      } else {
        // Trigger didn't create it (no team available or trigger missing) — create manually
        const equipeNextRes = await pool.query(
          `SELECT e.id, e.nom FROM equipes e
           WHERE e.type::text = $1 AND e.actif = TRUE
             AND e.statut_equipe = 'DISPONIBLE' AND e.disponible_a_partir_de <= NOW()
           ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
           LIMIT 1`,
          [nextTeamType]
        );

        if (equipeNextRes.rows.length > 0) {
          const eq = equipeNextRes.rows[0];
          equipeNextNom = eq.nom;
          await pool.query(`UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`, [eq.id]);

          const result = await pool.query(
            `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
             VALUES ($1, $2, $3::phase_mission, 'en_attente', NOW(), $4)
             RETURNING id`,
            [m.chantier_id, eq.id, nextPhase, `Transfert depuis ${m.phase} (${m.equipe_nom})`]
          );
          missionNextId = result.rows[0].id;

          await pool.query(
            `INSERT INTO checklists_phases (mission_id, phase, etapes)
             VALUES ($1, $2::phase_mission, generer_checklist($2))`,
            [missionNextId, nextPhase]
          );
        } else {
          const result = await pool.query(
            `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
             VALUES ($1, NULL, $2::phase_mission, 'en_attente', NOW(), $3)
             RETURNING id`,
            [m.chantier_id, nextPhase, `Transfert depuis ${m.phase} (${m.equipe_nom}) — assignation manuelle requise`]
          );
          missionNextId = result.rows[0].id;
        }
      }

      logger.info(`Transfert ${m.phase} → ${nextPhase}`, {
        chantier: m.nom_chantier, missionSrc: missionId, missionNext: missionNextId,
      });

      // 📲 SMS à l'équipe de la phase suivante
      if (equipeNextNom !== 'Aucune' && missionNextId) {
        try {
          const nextTeamRes = await pool.query(
            `SELECT e.id FROM equipes e WHERE e.nom = $1 LIMIT 1`, [equipeNextNom]
          );
          if (nextTeamRes.rows.length > 0) {
            const telRes = await pool.query(
              `SELECT telephone FROM utilisateurs WHERE equipe_id = $1 AND actif = TRUE
                 AND telephone IS NOT NULL AND telephone <> '' ORDER BY date_creation LIMIT 1`,
              [nextTeamRes.rows[0].id]
            );
            await smsService?.notifierNouvelleMission({
              equipeId: nextTeamRes.rows[0].id, equipeNom: equipeNextNom,
              telephone: telRes.rows[0]?.telephone || null,
              phase: nextPhase, chantierNom: m.nom_chantier, adresse: null,
              chantierId: m.chantier_id, missionId: missionNextId,
            });
          }
        } catch (smsErr) {
          logger.error('Erreur SMS transfert', { erreur: (smsErr as any).message });
        }
      }

      // SSE broadcast
      eventBus.emit('mission_transferee', {
        missionMeca: missionId,
        missionElecId: missionNextId,
        equipeMecaNom: m.equipe_nom,
        equipeElecNom: equipeNextNom,
        chantierNom: m.nom_chantier,
        chantierId: m.chantier_id,
      });

      const nextLabel = nextPhase === 'electrique' ? 'Électrique' : 'Vérification';
      res.json({
        ok: true,
        missionElecId: missionNextId,
        equipeElecNom: equipeNextNom,
        message: `✅ Phase ${m.phase} terminée. Mission ${nextLabel} assignée à ${equipeNextNom}.`,
      });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 6. POSITIONS ÉQUIPES — Pour la carte admin (temps réel) ─────
  router.get('/equipes', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `WITH derniere_position AS (
            SELECT DISTINCT ON (gt.equipe_id)
                gt.equipe_id, gt.latitude, gt.longitude, gt.vitesse_kmh,
                gt.batterie_pct, gt.date_creation AS last_update,
                om.id AS mission_id, om.chantier_id, c.nom_chantier AS destination,
                om.statut AS mission_statut
            FROM gps_tracking gt
            LEFT JOIN ordres_de_mission om ON om.id = gt.mission_id AND om.statut IN ('en_route','en_cours','en_attente','en_pause')
            LEFT JOIN chantiers c ON c.id = om.chantier_id
            WHERE gt.date_creation > NOW() - INTERVAL '4 hours'
            ORDER BY gt.equipe_id, gt.date_creation DESC
        )
        SELECT dp.equipe_id, dp.latitude, dp.longitude, dp.vitesse_kmh,
               dp.batterie_pct, dp.last_update, dp.mission_id, dp.destination,
               dp.mission_statut,
               e.nom AS equipe_nom, e.type AS equipe_type,
               eqs.statut_equipe,
               -- Distance to destination if both known
               CASE WHEN dp.latitude IS NOT NULL AND c2.chantier_lat IS NOT NULL THEN
                 ROUND((6371000 * 2 * ASIN(SIN(RADIANS(dp.latitude - c2.chantier_lat)/2) * COS(RADIANS(c2.chantier_lat))
                   * COS(RADIANS(dp.longitude - c2.chantier_lng)/2)))::NUMERIC, 0)
               ELSE NULL END AS distance_destination_m
        FROM derniere_position dp
        JOIN equipes e ON e.id = dp.equipe_id
        LEFT JOIN equipes eqs ON eqs.id = dp.equipe_id
        LEFT JOIN (
            SELECT om2.chantier_id,
                   ST_Y(c2.coordonnees::geometry) AS chantier_lat,
                   ST_X(c2.coordonnees::geometry) AS chantier_lng
            FROM ordres_de_mission om2 JOIN chantiers c2 ON c2.id = om2.chantier_id
            WHERE om2.statut IN ('en_route','en_cours','en_attente') AND om2.chantier_id IS NOT NULL
        ) c2 ON c2.chantier_id = dp.chantier_id
        ORDER BY dp.last_update DESC`
      );

      // Also get teams with missions but no GPS tracking (static positions)
      const { rows: staticTeams } = await pool.query(
        `SELECT e.id AS equipe_id, e.nom AS equipe_nom, e.type AS equipe_type,
                eqs.statut_equipe, om.id AS mission_id, om.statut AS mission_statut,
                c.nom_chantier AS destination,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS latitude,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS longitude
         FROM equipes e
         LEFT JOIN equipes eqs ON eqs.id = e.id
         LEFT JOIN ordres_de_mission om ON om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente','en_pause')
         LEFT JOIN chantiers c ON c.id = om.chantier_id
         WHERE eqs.statut_equipe = 'EN_MISSION'
           AND e.id NOT IN (SELECT equipe_id FROM gps_tracking WHERE date_creation > NOW() - INTERVAL '4 hours')
         ORDER BY e.nom`
      );

      // Merge: prefer live GPS positions, fallback to static chantier coords
      const liveIds = new Set(rows.map((r: any) => r.equipe_id));
      const merged = [...rows];
      for (const st of staticTeams) {
        if (!liveIds.has(st.equipe_id)) {
          merged.push(st);
        }
      }

      res.json(merged);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 7. RÉSUMÉ JOURNÉE — Pointages, pauses, durée ──────────────
  router.get('/journee', async (req, res) => {
    try {
      const { equipe_id } = req.query;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);

      const [pointages, pauses, missions] = await Promise.all([
        pool.query(
          `SELECT id, type_pointage AS "type", TO_CHAR(horodatage,'HH24:MI:SS') AS horodatage,
                  distance_chantier_m AS distance, dans_rayon AS conforme, notes
           FROM pointages_jour
           WHERE equipe_id = $1 AND DATE(horodatage) = $2
           ORDER BY horodatage`,
          [equipe_id, dateStr]
        ),
        pool.query(
          `SELECT id, type_pause AS "type", TO_CHAR(date_debut,'HH24:MI:SS') AS debut,
                  TO_CHAR(date_fin,'HH24:MI:SS') AS fin, duree_minutes, motif
           FROM pauses_journee
           WHERE equipe_id = $1 AND DATE(date_debut) = $2
           ORDER BY date_debut`,
          [equipe_id, dateStr]
        ),
        pool.query(
          `SELECT om.id, om.phase, om.statut,
                  TO_CHAR(om.date_debut_effectif,'HH24:MI') AS debut,
                  TO_CHAR(om.date_fin_effectif,'HH24:MI') AS fin,
                  c.nom_chantier
           FROM ordres_de_mission om
           JOIN chantiers c ON c.id = om.chantier_id
           WHERE om.equipe_id = $1 AND DATE(om.date_creation) = $2
           ORDER BY om.date_creation`,
          [equipe_id, dateStr]
        ),
      ]);

      // Calculate total work duration
      const matinal = pointages.rows.find(p => p.type === 'matinal');
      const finJournee = pointages.rows.find(p => p.type === 'fin_journee');
      const totalPauseMin = pauses.rows.reduce((sum, p) => sum + (parseFloat(p.duree_minutes) || 0), 0);

      let dureeTravailMinutes = 0;
      if (matinal && finJournee) {
        const debut = new Date(`2000-01-01T${matinal.horodatage}`);
        const fin = new Date(`2000-01-01T${finJournee.horodatage}`);
        dureeTravailMinutes = Math.max(0, (fin.getTime() - debut.getTime()) / 60000 - totalPauseMin);
      }

      res.json({
        date: dateStr,
        equipe_id,
        pointages: pointages.rows,
        pauses: pauses.rows,
        missions: missions.rows,
        resume: {
          heureArrivee: matinal?.horodatage || null,
          heureDepart: finJournee?.horodatage || null,
          dureeTravailMinutes: Math.round(dureeTravailMinutes),
          dureePauseMinutes: Math.round(totalPauseMin),
          nbPauses: pauses.rows.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
