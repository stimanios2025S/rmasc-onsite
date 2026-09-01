import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { verifierToken } from '../middleware/auth.middleware';
import { genererToken } from '../middleware/auth.middleware';
import { LoggerService } from '../services/notifications/logger.service';
import { eventBus } from '../services/events/event-bus';

/**
 * Magasinier Controller — Warehouse manager for equipment logistics
 *
 * Auth:
 *   POST  /api/magasinier/auth/login       — Magasinier login
 *   GET   /api/magasinier/auth/me          — Current user info
 *
 * Portal (role=magasinier):
 *   GET   /api/magasinier/demandes         — List demands for assigned chantiers
 *   PATCH /api/magasinier/demandes/:id     — Update demand status
 *   GET   /api/magasinier/stats            — Dashboard stats
 *   GET   /api/magasinier/chantiers        — Assigned chantiers
 *
 * Admin management (role=admin/dispatcher):
 *   GET    /api/magasinier/magasiniers     — List all magasiniers
 *   POST   /api/magasinier/magasiniers     — Create magasinier
 *   PUT    /api/magasinier/magasiniers/:id — Update magasinier
 *   DELETE /api/magasinier/magasiniers/:id — Deactivate magasinier
 *   PATCH  /api/magasinier/magasiniers/:id/password — Reset password
 */
export function creerMagasinierRouter(pool: Pool, logger: LoggerService): Router {
  const router = Router();

  // ═══════════════════════════════════════════════════════════════════════
  // AUTH — No token required
  // ═══════════════════════════════════════════════════════════════════════

  router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
    try {
      const { identifiant, motDePasse } = req.body;
      if (!identifiant || !motDePasse) {
        res.status(400).json({ erreur: 'Identifiant et mot de passe requis.' }); return;
      }

      const { rows } = await pool.query(
        `SELECT id, nom, prenom, identifiant, mot_de_passe_hash, telephone, actif
         FROM magasiniers WHERE identifiant = $1`,
        [identifiant]
      );

      if (rows.length === 0) {
        res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' }); return;
      }

      const mag = rows[0];
      if (!mag.actif) {
        res.status(403).json({ erreur: 'Compte désactivé. Contactez l\'administrateur.' }); return;
      }

      const valide = await bcrypt.compare(motDePasse, mag.mot_de_passe_hash);
      if (!valide) {
        res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' }); return;
      }

      // Update last login
      await pool.query('UPDATE magasiniers SET derniere_connexion = NOW() WHERE id = $1', [mag.id]);

      // Fetch assigned chantiers
      const { rows: chantiers } = await pool.query(
        `SELECT c.id, c.nom_chantier FROM magasinier_chantiers mc
         JOIN chantiers c ON c.id = mc.chantier_id
         WHERE mc.magasinier_id = $1`,
        [mag.id]
      );

      const payload = {
        userId: mag.id,
        email: '',
        role: 'magasinier',
        prenom: mag.prenom,
        nom: mag.nom,
        magasinierId: mag.id,
      };

      const token = genererToken(payload);

      logger.info('Connexion magasinier', { identifiant, nom: mag.nom });

      res.json({
        token,
        user: {
          id: mag.id,
          identifiant: mag.identifiant,
          prenom: mag.prenom,
          nom: mag.nom,
          telephone: mag.telephone,
          role: 'magasinier',
          chantiers,
        },
      });
    } catch (err: any) {
      logger.error('Erreur login magasinier', { erreur: err.message });
      res.status(500).json({ erreur: 'Erreur serveur.' });
    }
  });

  router.get('/auth/me', verifierToken, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { rows } = await pool.query(
        `SELECT id, nom, prenom, identifiant, telephone, actif FROM magasiniers WHERE id = $1`,
        [userId]
      );
      if (rows.length === 0) { res.status(404).json({ erreur: 'Magasinier introuvable.' }); return; }

      const { rows: chantiers } = await pool.query(
        `SELECT c.id, c.nom_chantier, c.adresse, c.statut
         FROM magasinier_chantiers mc
         JOIN chantiers c ON c.id = mc.chantier_id
         WHERE mc.magasinier_id = $1`,
        [userId]
      );

      res.json({ ...rows[0], chantiers });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PORTAL — Requires magasinier token
  // ═══════════════════════════════════════════════════════════════════════

  const requireMagasinier = (req: Request, res: Response, next: any) => {
    verifierToken(req, res, () => {
      if (req.user?.role !== 'magasinier' && req.user?.role !== 'administrateur') {
        res.status(403).json({ erreur: 'Accès réservé aux magasiniers.' }); return;
      }
      next();
    });
  };

  // GET /api/magasinier/demandes — list demands for assigned chantiers
  router.get('/demandes', requireMagasinier, async (req: Request, res: Response): Promise<void> => {
    try {
      const magId = req.user!.userId;
      const { statut } = req.query;

      let query = `
        SELECT dm.id, dm.type_demande, dm.statut, dm.description, dm.items,
               dm.photo_url, dm.pdf_url,
               dm.date_creation,
               e.nom AS equipe_nom, e.type AS equipe_type,
               c.nom_chantier AS chantier_nom, c.id AS chantier_id,
               c.adresse AS chantier_adresse
        FROM demandes_materiel dm
        LEFT JOIN equipes e ON e.id = dm.equipe_id
        LEFT JOIN chantiers c ON c.id = dm.chantier_id
        WHERE dm.chantier_id IN (
          SELECT mc.chantier_id FROM magasinier_chantiers mc WHERE mc.magasinier_id = $1
        )
      `;
      const params: any[] = [magId];

      if (statut && statut !== 'tous') {
        params.push(statut);
        query += ` AND dm.statut = $${params.length}`;
      }

      query += ` ORDER BY dm.date_creation DESC LIMIT 100`;

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // PATCH /api/magasinier/demandes/:id — update status
  router.patch('/demandes/:id', requireMagasinier, async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { statut } = req.body;
      const validStatuses = ['EN_ATTENTE', 'EN_PREPARATION', 'EXPEDIE', 'LIVREE', 'REFUSE'];
      if (!validStatuses.includes(statut)) {
        res.status(400).json({ erreur: `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}` }); return;
      }

      // Get current status
      const { rows: current } = await pool.query(
        `SELECT statut, equipe_id, chantier_id FROM demandes_materiel WHERE id = $1`, [id]
      );
      if (current.length === 0) { res.status(404).json({ erreur: 'Demande introuvable.' }); return; }

      // Update
      await pool.query(`UPDATE demandes_materiel SET statut = $1 WHERE id = $2`, [statut, id]);

      // SSE notification to admin
      const magName = `${req.user!.prenom} ${req.user!.nom}`;
      eventBus.emit('magasinier_status', {
        demandeId: id,
        statut,
        magasinierNom: magName,
        chantierId: current[0].chantier_id,
      });

      res.json({ message: 'Statut mis à jour.', statut });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // GET /api/magasinier/stats — dashboard stats
  router.get('/stats', requireMagasinier, async (req: Request, res: Response): Promise<void> => {
    try {
      const magId = req.user!.userId;
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE statut = 'EN_ATTENTE')::INT AS en_attente,
          COUNT(*) FILTER (WHERE statut = 'EN_PREPARATION')::INT AS en_preparation,
          COUNT(*) FILTER (WHERE statut = 'EXPEDIE')::INT AS expedie,
          COUNT(*) FILTER (WHERE statut = 'LIVREE')::INT AS livre,
          COUNT(*) FILTER (WHERE statut = 'REFUSE')::INT AS refuse,
          COUNT(*)::INT AS total
        FROM demandes_materiel
        WHERE chantier_id IN (
          SELECT mc.chantier_id FROM magasinier_chantiers mc WHERE mc.magasinier_id = $1
        )
      `, [magId]);
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // GET /api/magasinier/chantiers — assigned chantiers
  router.get('/chantiers', requireMagasinier, async (req: Request, res: Response): Promise<void> => {
    try {
      const magId = req.user!.userId;
      const { rows } = await pool.query(`
        SELECT c.id, c.nom_chantier, c.adresse, c.statut, c.client_nom, c.complexite,
               TO_CHAR(c.date_creation, 'YYYY-MM-DD') AS date_creation,
               (SELECT COUNT(*) FROM demandes_materiel dm WHERE dm.chantier_id = c.id AND dm.statut = 'EN_ATTENTE')::INT AS demandes_en_attente,
               (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id = c.id AND om.statut IN ('en_cours','en_attente'))::INT AS missions_actives,
               (SELECT e.nom FROM ordres_de_mission om2
                LEFT JOIN equipes e ON e.id = om2.equipe_id
                WHERE om2.chantier_id = c.id AND om2.statut IN ('en_cours','en_attente')
                ORDER BY om2.date_creation DESC LIMIT 1) AS equipe_actuelle
        FROM magasinier_chantiers mc
        JOIN chantiers c ON c.id = mc.chantier_id
        WHERE mc.magasinier_id = $1
        ORDER BY c.nom_chantier
      `, [magId]);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN MANAGEMENT — Requires admin/dispatcher token
  // ═══════════════════════════════════════════════════════════════════════

  const requireAdmin = (req: Request, res: Response, next: any) => {
    verifierToken(req, res, () => {
      if (req.user?.role !== 'administrateur' && req.user?.role !== 'dispatcher') {
        res.status(403).json({ erreur: 'Accès réservé à l\'administrateur.' }); return;
      }
      next();
    });
  };

  // GET /api/magasinier/magasiniers — list all
  router.get('/magasiniers', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
      const { rows: magasiniers } = await pool.query(`
        SELECT id, nom, prenom, identifiant, telephone, actif,
               TO_CHAR(date_creation, 'YYYY-MM-DD') AS date_creation,
               TO_CHAR(derniere_connexion, 'YYYY-MM-DD HH24:MI') AS derniere_connexion
        FROM magasiniers ORDER BY nom, prenom
      `);

      // Fetch chantier assignments
      const { rows: assignments } = await pool.query(`
        SELECT mc.magasinier_id, c.id AS chantier_id, c.nom_chantier
        FROM magasinier_chantiers mc
        JOIN chantiers c ON c.id = mc.chantier_id
      `);

      const chantiersByMag = new Map<string, { chantier_id: string; nom_chantier: string }[]>();
      for (const a of assignments) {
        if (!chantiersByMag.has(a.magasinier_id)) chantiersByMag.set(a.magasinier_id, []);
        chantiersByMag.get(a.magasinier_id)!.push({ chantier_id: a.chantier_id, nom_chantier: a.nom_chantier });
      }

      res.json(magasiniers.map(m => ({
        ...m,
        chantiers: chantiersByMag.get(m.id) || [],
      })));
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // POST /api/magasinier/magasiniers — create
  router.post('/magasiniers', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const { nom, prenom, identifiant, motDePasse, telephone, chantierIds } = req.body;
      if (!nom || !prenom || !identifiant || !motDePasse) {
        res.status(400).json({ erreur: 'nom, prenom, identifiant et mot de passe requis.' }); return;
      }

      // Check unique identifiant
      const { rows: existing } = await pool.query('SELECT id FROM magasiniers WHERE identifiant = $1', [identifiant]);
      if (existing.length > 0) {
        res.status(409).json({ erreur: 'Cet identifiant existe déjà.' }); return;
      }

      const hash = await bcrypt.hash(motDePasse, 10);
      const { rows } = await pool.query(
        `INSERT INTO magasiniers (nom, prenom, identifiant, mot_de_passe_hash, telephone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nom, prenom, identifiant, hash, telephone || null]
      );
      const magId = rows[0].id;

      // Assign chantiers
      if (chantierIds && Array.isArray(chantierIds) && chantierIds.length > 0) {
        for (const cId of chantierIds) {
          await pool.query(
            `INSERT INTO magasinier_chantiers (magasinier_id, chantier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [magId, cId]
          );
        }
      }

      logger.info('Magasinier créé', { id: magId, identifiant, nom: `${prenom} ${nom}` });
      res.status(201).json({ id: magId, message: 'Magasinier créé avec succès.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // PUT /api/magasinier/magasiniers/:id — update
  router.put('/magasiniers/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { nom, prenom, telephone, actif, chantierIds } = req.body;

      await pool.query(
        `UPDATE magasiniers SET
           nom = COALESCE($1, nom),
           prenom = COALESCE($2, prenom),
           telephone = COALESCE($3, telephone),
           actif = COALESCE($4, actif)
         WHERE id = $5`,
        [nom || null, prenom || null, telephone || null, actif !== undefined ? actif : null, id]
      );

      // Update chantier assignments
      if (chantierIds && Array.isArray(chantierIds)) {
        await pool.query('DELETE FROM magasinier_chantiers WHERE magasinier_id = $1', [id]);
        for (const cId of chantierIds) {
          await pool.query(
            `INSERT INTO magasinier_chantiers (magasinier_id, chantier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, cId]
          );
        }
      }

      res.json({ message: 'Magasinier mis à jour.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // DELETE /api/magasinier/magasiniers/:id — deactivate
  router.delete('/magasiniers/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      await pool.query('UPDATE magasiniers SET actif = FALSE WHERE id = $1', [req.params.id]);
      res.json({ message: 'Magasinier désactivé.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  // PATCH /api/magasinier/magasiniers/:id/password — reset password
  router.patch('/magasiniers/:id/password', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const { motDePasse } = req.body;
      if (!motDePasse || motDePasse.length < 4) {
        res.status(400).json({ erreur: 'Mot de passe requis (min 4 caractères).' }); return;
      }
      const hash = await bcrypt.hash(motDePasse, 10);
      await pool.query('UPDATE magasiniers SET mot_de_passe_hash = $1 WHERE id = $2', [hash, req.params.id]);
      res.json({ message: 'Mot de passe réinitialisé.' });
    } catch (err: any) {
      res.status(500).json({ erreur: err.message });
    }
  });

  return router;
}
