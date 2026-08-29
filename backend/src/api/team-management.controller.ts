import { Router } from 'express';
import { Pool } from 'pg';
import { verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';

/**
 * Team Management Controller — Admin CRUD for teams, members, rest config, reassignment
 *
 * Endpoints:
 *   GET    /api/admin/teams               — List all teams with members
 *   PATCH  /api/admin/teams/:id           — Update team (name, type, color)
 *   PUT    /api/admin/teams/:id/members   — Update team member names
 *   GET    /api/admin/teams/config        — Get system config (rest days)
 *   PATCH  /api/admin/teams/config        — Update system config
 *   GET    /api/admin/teams/missions      — Active missions for reassignment
 *   PATCH  /api/admin/teams/missions/:id/reassign — Reassign mission to different team
 */
export function creerTeamManagementRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();
  router.use(verifierToken);

  // ─── 1. LIST ALL TEAMS WITH MEMBERS ──────────────────────────────────
  router.get('/', async (_req, res) => {
    try {
      const { rows: teams } = await pool.query(`
        SELECT
          e.id, e.nom, e.type::text AS type, e.couleur_hex, e.actif,
          e.statut_equipe, e.disponible_a_partir_de,
          TO_CHAR(e.date_creation, 'YYYY-MM-DD') AS date_creation,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente'))::INT AS missions_actives,
          CASE WHEN e.disponible_a_partir_de > NOW()
            THEN EXTRACT(DAY FROM e.disponible_a_partir_de - NOW())::INT
            ELSE 0 END AS jours_repos_restants
        FROM equipes e
        ORDER BY e.type, e.nom
      `);

      // Fetch members for each team
      const { rows: members } = await pool.query(`
        SELECT id, equipe_id, prenom, nom, role::text AS role, telephone, actif
        FROM utilisateurs
        WHERE equipe_id IS NOT NULL AND actif = TRUE
        ORDER BY equipe_id, role, nom
      `);

      const membersByTeam = new Map<string, typeof members>();
      for (const m of members) {
        if (!membersByTeam.has(m.equipe_id)) membersByTeam.set(m.equipe_id, []);
        membersByTeam.get(m.equipe_id)!.push(m);
      }

      const result = teams.map(t => ({
        ...t,
        membres: membersByTeam.get(t.id) || [],
      }));

      res.json(result);
    } catch (err: any) {
      logger.error('Erreur listing equipes', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 2. GET SYSTEM CONFIG ────────────────────────────────────────────
  // (MUST come before /:id routes)
  router.get('/config', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT cle, valeur, description FROM parametres_systeme ORDER BY cle`
      );
      const config: Record<string, { valeur: string; description: string }> = {};
      for (const r of rows) {
        config[r.cle] = { valeur: r.valeur, description: r.description };
      }
      res.json(config);
    } catch (err: any) {
      logger.error('Erreur lecture config', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 3. UPDATE SYSTEM CONFIG ─────────────────────────────────────────
  router.patch('/config', async (req, res) => {
    try {
      const { parametres } = req.body;
      if (!parametres || typeof parametres !== 'object') {
        return res.status(400).json({ erreur: 'Format invalide. Attendu: { parametres: { cle: valeur } }' });
      }
      for (const [cle, valeur] of Object.entries(parametres)) {
        if (typeof valeur !== 'string') continue;
        await pool.query(
          `INSERT INTO parametres_systeme (cle, valeur, date_modification)
           VALUES ($1, $2, NOW())
           ON CONFLICT (cle) DO UPDATE SET valeur = $2, date_modification = NOW()`,
          [cle, valeur]
        );
      }
      logger.info('Config système mise à jour', { cles: Object.keys(parametres) });
      res.json({ ok: true, message: 'Configuration mise à jour.' });
    } catch (err: any) {
      logger.error('Erreur mise à jour config', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 4. LIST ACTIVE MISSIONS FOR REASSIGNMENT ────────────────────────
  // (MUST come before /:id routes)
  router.get('/missions', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          om.id, om.phase::text AS phase, om.statut::text AS statut,
          om.date_declenchement, om.date_debut_effectif,
          c.nom_chantier, c.reference_commande_erp AS ref_erp,
          e.nom AS equipe_nom, e.id AS equipe_id, e.type::text AS equipe_type,
          cl.complete AS checklist_complete
        FROM ordres_de_mission om
        JOIN chantiers c ON c.id = om.chantier_id
        LEFT JOIN equipes e ON e.id = om.equipe_id
        LEFT JOIN (
          SELECT DISTINCT ON (mission_id) mission_id, complete
          FROM checklists_phases
          ORDER BY mission_id, date_mise_a_jour DESC
        ) cl ON cl.mission_id = om.id
        WHERE om.statut IN ('en_attente', 'en_route', 'en_cours', 'en_pause', 'bloque')
        ORDER BY om.date_declenchement DESC
      `);
      res.json(rows);
    } catch (err: any) {
      logger.error('Erreur listing missions', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 5. UPDATE TEAM (name, type, color) ──────────────────────────────
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { nom, type, couleur_hex, actif } = req.body;

      const sets: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (nom !== undefined) { sets.push(`nom = $${idx++}`); values.push(nom); }
      if (type !== undefined) { sets.push(`type = $${idx++}::type_equipe`); values.push(type); }
      if (couleur_hex !== undefined) { sets.push(`couleur_hex = $${idx++}`); values.push(couleur_hex); }
      if (actif !== undefined) { sets.push(`actif = $${idx++}`); values.push(actif); }

      if (sets.length === 0) {
        return res.status(400).json({ erreur: 'Aucun champ à modifier.' });
      }

      sets.push(`date_modification = NOW()`);
      values.push(id);

      const { rows } = await pool.query(
        `UPDATE equipes SET ${sets.join(', ')} WHERE id = $${idx}
         RETURNING id, nom, type::text AS type, couleur_hex, actif`,
        values
      );

      if (rows.length === 0) {
        return res.status(404).json({ erreur: 'Équipe introuvable.' });
      }

      logger.info('Équipe mise à jour', { equipeId: id, champs: Object.keys(req.body) });
      res.json({ ok: true, equipe: rows[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(409).json({ erreur: 'Ce nom d\'équipe existe déjà.' });
      }
      logger.error('Erreur mise à jour équipe', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 6. UPDATE TEAM MEMBER NAMES ─────────────────────────────────────
  router.put('/:id/members', async (req, res) => {
    try {
      const { id: equipeId } = req.params;
      const { membres } = req.body;

      if (!Array.isArray(membres)) {
        return res.status(400).json({ erreur: 'Format invalide. Attendu: { membres: [...] }' });
      }

      const updated: any[] = [];

      for (const m of membres) {
        if (!m.id) continue;
        const { rows } = await pool.query(
          `UPDATE utilisateurs
           SET prenom = COALESCE($1, prenom),
               nom = COALESCE($2, nom),
               telephone = $3,
               date_modification = NOW()
           WHERE id = $4 AND equipe_id = $5
           RETURNING id, prenom, nom, telephone, role::text AS role`,
          [m.prenom || null, m.nom || null, m.telephone ?? null, m.id, equipeId]
        );
        if (rows.length > 0) updated.push(rows[0]);
      }

      logger.info('Membres équipe mis à jour', { equipeId, count: updated.length });
      res.json({ ok: true, membres: updated });
    } catch (err: any) {
      logger.error('Erreur mise à jour membres', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  // ─── 7. REASSIGN MISSION TO DIFFERENT TEAM ───────────────────────────
  router.patch('/missions/:id/reassign', async (req, res) => {
    try {
      const { id: missionId } = req.params;
      const { equipe_id: newEquipeId } = req.body;

      if (!newEquipeId) {
        return res.status(400).json({ erreur: 'equipe_id requis.' });
      }

      const missionRes = await pool.query(
        `SELECT om.*, e.nom AS ancienne_equipe_nom, e.type::text AS ancienne_equipe_type,
                c.nom_chantier
         FROM ordres_de_mission om
         LEFT JOIN equipes e ON e.id = om.equipe_id
         JOIN chantiers c ON c.id = om.chantier_id
         WHERE om.id = $1`,
        [missionId]
      );

      if (missionRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Mission introuvable.' });
      }

      const mission = missionRes.rows[0];

      const equipeRes = await pool.query(
        `SELECT id, nom, type::text AS type FROM equipes WHERE id = $1 AND actif = TRUE`,
        [newEquipeId]
      );

      if (equipeRes.rows.length === 0) {
        return res.status(404).json({ erreur: 'Nouvelle équipe introuvable ou inactive.' });
      }

      const newEquipe = equipeRes.rows[0];

      await pool.query(
        `UPDATE ordres_de_mission SET equipe_id = $1, date_modification = NOW() WHERE id = $2`,
        [newEquipeId, missionId]
      );

      if (mission.statut === 'en_cours' || mission.statut === 'en_attente') {
        await pool.query(
          `UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1 AND statut_equipe = 'DISPONIBLE'`,
          [newEquipeId]
        );
      }

      logger.info('Mission réassignée', {
        missionId, ancienneEquipe: mission.ancienne_equipe_nom,
        nouvelleEquipe: newEquipe.nom, chantier: mission.nom_chantier,
      });

      res.json({
        ok: true,
        message: `Mission réassignée de "${mission.ancienne_equipe_nom}" à "${newEquipe.nom}".`,
        mission: {
          id: missionId,
          ancienne_equipe: mission.ancienne_equipe_nom,
          nouvelle_equipe: newEquipe.nom,
          nouvelle_equipe_type: newEquipe.type,
        },
      });
    } catch (err: any) {
      logger.error('Erreur réassignation mission', { erreur: err.message });
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
