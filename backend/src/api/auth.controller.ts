import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { genererToken, verifierToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';

export function creerAuthRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();

  // POST /api/auth/login
  router.post('/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifiant, motDePasse } = req.body;

      if (!identifiant || !motDePasse) {
        res.status(400).json({ erreur: 'Identifiant et mot de passe requis.' });
        return;
      }

      const { rows } = await pool.query(
        `SELECT u.id, u.identifiant, u.email, u.prenom, u.nom, u.role,
                u.equipe_id AS "equipeId", u.mot_de_passe_hash,
                e.nom AS "nomEquipe", e.type AS "typeEquipe"
         FROM utilisateurs u
         LEFT JOIN equipes e ON e.id = u.equipe_id
         WHERE u.identifiant = $1 AND u.actif = TRUE`,
        [identifiant]
      );

      if (rows.length === 0) {
        res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' });
        return;
      }

      const user = rows[0];
      const valide = await bcrypt.compare(motDePasse, user.mot_de_passe_hash);
      if (!valide) {
        res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' });
        return;
      }

      // Mettre à jour la dernière connexion
      await pool.query('UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = $1', [user.id]);

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        prenom: user.prenom,
        nom: user.nom,
        equipeId: user.equipeId,
        nomEquipe: user.nomEquipe,
        typeEquipe: user.typeEquipe,
      };

      const token = genererToken(payload);

      logger.info('Connexion réussie', { identifiant, role: user.role, equipe: user.nomEquipe });

      res.json({
        token,
        user: {
          id: user.id,
          identifiant: user.identifiant,
          email: user.email,
          prenom: user.prenom,
          nom: user.nom,
          role: user.role,
          equipeId: user.equipeId,
          nomEquipe: user.nomEquipe,
          typeEquipe: user.typeEquipe,
        },
      });
    } catch (err: any) {
      logger.error('Erreur login', { erreur: err.message });
      res.status(500).json({ erreur: 'Erreur serveur.' });
    }
  });

  // GET /api/auth/me — renvoie l'utilisateur connecté
  router.get('/me', verifierToken, async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await pool.query(
        `SELECT id, identifiant, email, prenom, nom, role, equipe_id AS "equipeId", telephone
         FROM utilisateurs WHERE id = $1`,
        [req.user!.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ erreur: 'Utilisateur introuvable.' });
        return;
      }
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
