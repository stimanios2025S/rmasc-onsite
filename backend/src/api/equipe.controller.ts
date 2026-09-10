import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { sweepReposExpires } from '../services/repos-chantier.service';

export function creerEquipeRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/equipe/status?equipe_id=
  router.get('/status', async (req, res) => {
    try {
      const { equipe_id } = req.query;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      // Repos-chantier : clôturer les repos expirés (missions reprises,
      // équipes libérées) AVANT toute logique de statut.
      try { await sweepReposExpires(pool, equipe_id as string); } catch (_) { /* non bloquant */ }

      // Repos-chantier actif ? → l'équipe reste EN_REPOS jusqu'à la fin
      // prévue (même si disponible_a_partir_de a été écrasé entre-temps).
      const reposHold = await pool.query(
        `SELECT MAX(date_fin_prevue) AS fin FROM repos_chantier
         WHERE equipe_id = $1 AND statut = 'actif'`,
        [equipe_id]
      );
      if (reposHold.rows[0]?.fin) {
        await pool.query(
          `UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = $2,
                  date_modification = NOW() WHERE id = $1`,
          [equipe_id, reposHold.rows[0].fin]
        );
      } else {
        // Repos expiré → libération automatique (le compteur du portail
        // worker dit "Disponible maintenant" mais le statut restait EN_REPOS
        // car personne ne le remettait à DISPONIBLE à la date prévue).
        await pool.query(
          `UPDATE equipes
           SET statut_equipe = 'DISPONIBLE', date_modification = NOW()
           WHERE id = $1 AND statut_equipe = 'EN_REPOS'
             AND disponible_a_partir_de IS NOT NULL
             AND disponible_a_partir_de <= NOW()`,
          [equipe_id]
        );
      }

      const { rows } = await pool.query(
        `SELECT id, nom, type, statut_equipe,
                TO_CHAR(disponible_a_partir_de,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS disponible_a_partir_de
         FROM equipes WHERE id = $1`,
        [equipe_id]
      );

      if (rows.length === 0) return res.status(404).json({ erreur: 'Équipe introuvable.' });
      const statut = rows[0];

      // Repos de l'équipe sur ses chantiers (actifs + derniers terminés) → portail ouvrier
      try {
        const reposRes = await pool.query(
          `SELECT rc.id, rc.chantier_id, c.nom_chantier, rc.jours_prevus,
                  TO_CHAR(rc.date_debut,'YYYY-MM-DD HH24:MI') AS date_debut,
                  TO_CHAR(rc.date_fin_prevue,'YYYY-MM-DD HH24:MI') AS date_fin_prevue,
                  rc.statut, rc.motif,
                  CASE WHEN rc.statut = 'actif' AND rc.date_fin_prevue > NOW()
                    THEN CEIL(EXTRACT(EPOCH FROM rc.date_fin_prevue - NOW()) / 86400)::INT
                    ELSE 0 END AS jours_restants
           FROM repos_chantier rc
           JOIN chantiers c ON c.id = rc.chantier_id
           WHERE rc.equipe_id = $1
           ORDER BY (rc.statut = 'actif') DESC, rc.date_creation DESC
           LIMIT 5`,
          [equipe_id]
        );
        (statut as any).repos = reposRes.rows;
      } catch (_) { (statut as any).repos = []; /* table absente avant migration v23 */ }
      res.json(statut);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // GET /api/equipe/:id/equipements — équipements de l'équipe
  router.get('/:id/equipements', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, nom, categorie, quantite, etat, date_assignation
         FROM equipements_equipe WHERE equipe_id = $1 ORDER BY categorie, nom`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // GET /api/equipe/:id/equipements_chantier?chantier_id=
  router.get('/:id/equipements_chantier', async (req, res) => {
    try {
      const { chantier_id } = req.query;
      if (!chantier_id) return res.status(400).json({ erreur: 'chantier_id requis.' });
      const { rows } = await pool.query(
        `SELECT id, nom, quantite, fourni_par, verifie
         FROM equipements_chantier WHERE chantier_id = $1 ORDER BY nom`,
        [chantier_id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // PATCH /api/equipe/:id/equipements_chantier/:eqId — vérifier un équipement
  router.patch('/:id/equipements_chantier/:eqId', async (req, res) => {
    try {
      await pool.query(
        `UPDATE equipements_chantier SET verifie = TRUE WHERE id = $1`,
        [req.params.eqId]
      );
      res.json({ message: 'Équipement vérifié.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
