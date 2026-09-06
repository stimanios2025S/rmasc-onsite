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

  // PATCH /api/auth/change-password — changer le mot de passe de l'admin
  router.patch('/change-password', verifierToken, async (req: Request, res: Response): Promise<void> => {
    try {
      const { motDePasseActuel, nouveauMotDePasse } = req.body;
      if (!motDePasseActuel || !nouveauMotDePasse) {
        res.status(400).json({ erreur: 'Mot de passe actuel et nouveau mot de passe requis.' });
        return;
      }
      if (nouveauMotDePasse.length < 6) {
        res.status(400).json({ erreur: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
        return;
      }
      // Fetch current hash
      const { rows } = await pool.query('SELECT mot_de_passe_hash FROM utilisateurs WHERE id = $1', [req.user!.userId]);
      if (rows.length === 0) {
        res.status(404).json({ erreur: 'Utilisateur introuvable.' });
        return;
      }
      const valide = await bcrypt.compare(motDePasseActuel, rows[0].mot_de_passe_hash);
      if (!valide) {
        res.status(401).json({ erreur: 'Mot de passe actuel incorrect.' });
        return;
      }
      const hash = await bcrypt.hash(nouveauMotDePasse, 10);
      await pool.query('UPDATE utilisateurs SET mot_de_passe_hash = $1, date_modification = NOW() WHERE id = $2', [hash, req.user!.userId]);
      logger.info('Mot de passe admin changé', { userId: req.user!.userId });
      res.json({ message: 'Mot de passe mis à jour avec succès.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
