import { Request, Response, Router } from 'express';
import { Pool } from 'pg';

export function creerEquipeRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/equipe/status?equipe_id=
  router.get('/status', async (req, res) => {
    try {
      const { equipe_id } = req.query;
      if (!equipe_id) return res.status(400).json({ erreur: 'equipe_id requis.' });

      const { rows } = await pool.query(
        `SELECT id, nom, type, statut_equipe,
                TO_CHAR(disponible_a_partir_de,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS disponible_a_partir_de
         FROM equipes WHERE id = $1`,
        [equipe_id]
      );

      if (rows.length === 0) return res.status(404).json({ erreur: 'Équipe introuvable.' });
      res.json(rows[0]);
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
