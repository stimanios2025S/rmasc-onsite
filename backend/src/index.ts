import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { ChantierRepository } from './repositories/chantier.repository';
import { MissionRepository } from './repositories/mission.repository';
import { EquipeRepository } from './repositories/equipe.repository';
import { TechnicienRepository } from './repositories/technicien.repository';
import { PointageRepository } from './repositories/pointage.repository';
import { BlocageRepository } from './repositories/blocage.repository';
import { NotificationService } from './services/notifications/notification.service';
import { LoggerService } from './services/notifications/logger.service';
import { PointageService } from './services/moduleA/pointage.service';
import { RelaisPhaseService } from './services/moduleB/relais-phase.service';
import { BlocageService } from './services/moduleC/blocage.service';
import { creerWebhookHandler } from './api/webhook.controller';
import { creerAuthRouter } from './api/auth.controller';
import { creerAdminRouter } from './api/admin.controller';
import { creerMissionRouter } from './api/mission.controller';
import { creerEquipeRouter } from './api/equipe.controller';
import { creerUploadRouter } from './api/upload.controller';
import path from 'path';
import { creerPages } from './views';

const {
  DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'rmasc_onsite',
  DB_USER = 'rmasc', DB_PASSWORD = '', ERP_WEBHOOK_URL = '', ERP_WEBHOOK_SECRET = '',
  JWT_SECRET = 'rmasc-onsite-jwt-secret',
  PORT = '4000',
} = process.env;

const pool = new Pool({
  host: DB_HOST, port: parseInt(DB_PORT, 10), database: DB_NAME,
  user: DB_USER, password: DB_PASSWORD, max: 20,
  idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});

const logger = new LoggerService('RMASC-OnSite');
const notifier = new NotificationService(logger, { erpWebhookUrl: ERP_WEBHOOK_URL, erpWebhookSecret: ERP_WEBHOOK_SECRET });

const chantierRepo = new ChantierRepository(pool);
const missionRepo = new MissionRepository(pool);
const equipeRepo = new EquipeRepository(pool);
const technicienRepo = new TechnicienRepository(pool);
const pointageRepo = new PointageRepository(pool);
const blocageRepo = new BlocageRepository(pool);

export const pointageService = new PointageService(pool, missionRepo, chantierRepo, technicienRepo, pointageRepo, notifier, logger);
export const relaisPhaseService = new RelaisPhaseService(missionRepo, chantierRepo, equipeRepo, notifier, logger);
export const blocageService = new BlocageService(blocageRepo, missionRepo, chantierRepo, notifier, logger);

// ─── Serveur HTTP Express ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Rate limiting (sécurité) ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requêtes par fenêtre
  message: { erreur: 'Trop de requêtes. Réessayez plus tard.' },
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rmasc-onsite', timestamp: new Date().toISOString() });
});

// Routes d'authentification
app.use('/api/auth', creerAuthRouter(pool, logger));

// Routes admin (El Ghani — protégées par JWT)
app.use('/api/admin', creerAdminRouter(pool, logger));

// Routes mission (technicien mobile)
app.use('/api/mission', creerMissionRouter(pool, logger));

// Routes équipe (statut, repos)
app.use('/api/equipe', creerEquipeRouter(pool));

// Routes upload
app.use('/api/upload', creerUploadRouter(pool));

// Static files (uploads) — same dir as upload.controller.ts (backend/public/uploads)
const UPLOADS_DIR = path.resolve(__dirname, '../public/uploads');
if (!require('fs').existsSync(UPLOADS_DIR)) require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Route API chantiers (avec coordonnées pour la carte)
app.get('/api/chantiers', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.reference_commande_erp AS ref, c.nom_chantier AS nom, c.statut,
              c.client_nom, c.complexite, c.dxf_url AS dxf, c.pdf_url AS pdf,
              ST_X(c.coordonnees::geometry) AS lng, ST_Y(c.coordonnees::geometry) AS lat,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id) AS missions,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id AND om.statut='en_cours') AS en_cours,
              TO_CHAR(c.date_creation,'YYYY-MM-DD HH24:MI') AS date_creation
       FROM chantiers c ORDER BY c.date_creation DESC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ erreur: 'Erreur serveur.', detail: err.message });
  }
});

// POST /api/chantiers — création manuelle d'un chantier (El Ghani)
app.post('/api/chantiers', async (req, res) => {
  try {
    const { nom, client_nom, adresse, latitude, longitude, rayon_geofencing, complexite, reference_commande_erp, dxfUrl, pdfUrl, ficheTechnique } = req.body;
    if (!nom || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ erreur: 'nom, latitude et longitude requis.' });
    }
    const ref = reference_commande_erp || `MAN-${Date.now().toString().slice(-6)}`;
    const validComplexity = ['FACILE','MOYENNE','DIFFICILE'].includes(complexite) ? complexite : 'MOYENNE';

    const { rows } = await pool.query(
      `INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees,
                              rayon_geofencing, statut, client_nom, complexite,
                              dxf_url, pdf_url, fiche_technique)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, 'planifie', $7, $8, $9, $10, $11)
       RETURNING id`,
      [ref, nom, adresse || null, longitude, latitude, rayon_geofencing || 50, client_nom || null, validComplexity,
       dxfUrl || null, pdfUrl || null, ficheTechnique ? JSON.stringify({ spec: ficheTechnique }) : null]
    );
    const chantierId = rows[0].id;

    // Assigner une équipe mécanique disponible + créer mission + checklist
    const equipeResult = await pool.query(
      `SELECT e.id, e.nom FROM equipes e
       WHERE e.type = 'mecanique' AND e.actif = TRUE
         AND e.statut_equipe = 'DISPONIBLE' AND e.disponible_a_partir_de <= NOW()
       ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om
                 WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
       LIMIT 1`
    );

    let missionId: string | null = null;
    let equipeNom: string | null = null;
    if (equipeResult.rows.length > 0) {
      const equipe = equipeResult.rows[0];
      await pool.query(`UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`, [equipe.id]);
      const missionResult = await pool.query(
        `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours)
         VALUES ($1, $2, 'mecanique', 'en_attente', NOW(),
                 (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = 'mecanique'))
         RETURNING id`,
        [chantierId, equipe.id]
      );
      missionId = missionResult.rows[0].id;
      equipeNom = equipe.nom;
      await pool.query(
        `INSERT INTO checklists_phases (mission_id, phase, etapes) VALUES ($1, 'mecanique', generer_checklist('mecanique'))`,
        [missionId]
      );
    }

    res.status(201).json({ chantierId, missionId, equipeNom, message: `Chantier "${nom}" créé.` });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// PUT /api/chantiers/:id — modifier un chantier (El Ghani)
app.put('/api/chantiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, client_nom, adresse, latitude, longitude, rayon_geofencing, complexite, dxfUrl, pdfUrl, ficheTechnique } = req.body;
    if (!nom) return res.status(400).json({ erreur: 'nom requis.' });

    const validComplexity = ['FACILE','MOYENNE','DIFFICILE'].includes(complexite) ? complexite : 'MOYENNE';
    const lat = latitude !== undefined ? latitude : null;
    const lng = longitude !== undefined ? longitude : null;

    await pool.query(
      `UPDATE chantiers SET
         nom_chantier = $1, client_nom = COALESCE($2, client_nom), adresse = COALESCE($3, adresse),
         rayon_geofencing = $4, complexite = $5,
         dxf_url = COALESCE($6, dxf_url), pdf_url = COALESCE($7, pdf_url),
         fiche_technique = COALESCE($8, fiche_technique),
         coordonnees = CASE WHEN $9 IS NOT NULL AND $10 IS NOT NULL
                            THEN ST_SetSRID(ST_MakePoint($10, $9), 4326)
                            ELSE coordonnees END,
         date_modification = NOW()
       WHERE id = $11`,
      [nom, client_nom || null, adresse || null, rayon_geofencing || 50, validComplexity,
       dxfUrl || null, pdfUrl || null, ficheTechnique ? JSON.stringify({ spec: ficheTechnique }) : null,
       lat, lng, id]
    );
    res.json({ message: `Chantier "${nom}" mis à jour.` });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// DELETE /api/chantiers/:id — supprimer un chantier (El Ghani)
app.delete('/api/chantiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Supprimer les missions associées (cascade via chantier)
    await pool.query(`DELETE FROM chantiers WHERE id = $1`, [id]);
    res.json({ message: 'Chantier supprimé.' });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// GET /api/chantiers/:id/pointages — pointages GPS réels d'un chantier
app.get('/api/chantiers/:id/pointages', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT jp.id, jp.type_pointage AS "type",
              TO_CHAR(jp.horodatage,'YYYY-MM-DD HH24:MI:SS') AS horodatage,
              jp.distance_chantier_m AS distance, jp.dans_rayon AS conforme,
              u.prenom || ' ' || u.nom AS technicien_nom
       FROM journal_pointage_gps jp
       JOIN ordres_de_mission om ON om.id = jp.ordre_mission_id
       JOIN utilisateurs u ON u.id = jp.utilisateur_id
       WHERE om.chantier_id = $1
       ORDER BY jp.horodatage DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// GET /api/chantiers/:id/detail — détail complet (missions, fichiers, délais)
app.get('/api/chantiers/:id/detail', async (req, res) => {
  try {
    const chantierRes = await pool.query(
      `SELECT c.*, ST_X(c.coordonnees::geometry) AS lng, ST_Y(c.coordonnees::geometry) AS lat
       FROM chantiers c WHERE c.id = $1`, [req.params.id]
    );
    if (chantierRes.rows.length === 0) return res.status(404).json({ erreur: 'Introuvable.' });
    const chantier = chantierRes.rows[0];

    const missionsRes = await pool.query(
      `SELECT om.id, om.phase, om.statut, om.duree_estimee_jours,
              TO_CHAR(om.date_declenchement,'YYYY-MM-DD HH24:MI') AS date_declenchement,
              TO_CHAR(om.date_debut_effectif,'YYYY-MM-DD HH24:MI') AS date_debut,
              TO_CHAR(om.date_fin_effectif,'YYYY-MM-DD HH24:MI') AS date_fin,
              e.nom AS equipe_nom,
              CASE WHEN om.date_fin_effectif IS NOT NULL AND om.duree_estimee_jours IS NOT NULL
                   THEN EXTRACT(DAY FROM om.date_fin_effectif - om.date_debut_effectif) - om.duree_estimee_jours
                   ELSE NULL END AS retard_jours
       FROM ordres_de_mission om JOIN equipes e ON e.id = om.equipe_id
       WHERE om.chantier_id = $1 ORDER BY om.date_creation`, [req.params.id]
    );

    res.json({ chantier, missions: missionsRes.rows });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// Pages Web (chantiers, missions, détails)
app.use('/', creerPages(pool));

// Webhook ERP — appelé par l'ERP quand une commande est terminée
app.post('/api/webhook/erp', creerWebhookHandler(
  pool, chantierRepo, missionRepo, equipeRepo, logger, ERP_WEBHOOK_SECRET
));

// Démarrer le serveur
const port = parseInt(PORT, 10);
app.listen(port, () => {
  logger.info(`RMASC OnSite — Serveur démarré sur le port ${port}`);
  pool.query('SELECT 1')
    .then(() => logger.info('PostgreSQL OK'))
    .catch(e => logger.error('PostgreSQL', { erreur: e.message }));
});

export { app };
