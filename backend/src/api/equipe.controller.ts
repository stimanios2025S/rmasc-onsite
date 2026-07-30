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

  return router;
}
