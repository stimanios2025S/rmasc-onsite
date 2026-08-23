import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import compression from 'compression';
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
import { creerGeofencingRouter } from './api/geofencing.controller';
import { SmsService } from './services/sms/sms.service';
import { SmsWorker } from './services/sms/sms.worker';
import path from 'path';
import { creerPages } from './views';

const {
  DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'rmasc_onsite',
  DB_USER = 'rmasc', DB_PASSWORD = '', ERP_WEBHOOK_URL = '', ERP_WEBHOOK_SECRET = '',
  JWT_SECRET = 'rmasc-onsite-jwt-secret',
  SMS_PROVIDER = 'simulation', TWILIO_ACCOUNT_SID = '', TWILIO_AUTH_TOKEN = '', TWILIO_FROM_NUMBER = '',
  PORT = '4000',
} = process.env;

const pool = new Pool({
  host: DB_HOST, port: parseInt(DB_PORT, 10), database: DB_NAME,
  user: DB_USER, password: DB_PASSWORD, max: 20,
  idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});

const logger = new LoggerService('RMASC-OnSite');
const notifier = new NotificationService(logger, { erpWebhookUrl: ERP_WEBHOOK_URL, erpWebhookSecret: ERP_WEBHOOK_SECRET });

// ─── Service SMS (file d'attente + worker d'envoi) ────────────────────
const smsService = new SmsService(pool, logger, {
  fournisseur: (SMS_PROVIDER === 'twilio' ? 'twilio' : 'simulation'),
  twilioAccountSid: TWILIO_ACCOUNT_SID,
  twilioAuthToken: TWILIO_AUTH_TOKEN,
  twilioFromNumber: TWILIO_FROM_NUMBER,
});
export { smsService };

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
app.use(compression()); // gzip — réponses plus rapides
app.use(cors());
app.use(express.json());

// ─── Rate limiting (sécurité) ──────────────────────────────────────────
// 1000 req/15min par IP — suffisant pour le polling 5s + actions
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { erreur: 'Trop de requêtes. Réessayez plus tard.' },
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.path === '/api/auth/login', // ne pas bloquer health + login
});
app.use('/api', limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rmasc-onsite', timestamp: new Date().toISOString() });
});

// Routes d'authentification
app.use('/api/auth', creerAuthRouter(pool, logger));

// Routes admin (El Ghani — protégées par JWT)
app.use('/api/admin', creerAdminRouter(pool, logger, smsService));

// Routes mission (technicien mobile)
app.use('/api/mission', creerMissionRouter(pool, logger));

// Routes équipe (statut, repos)
app.use('/api/equipe', creerEquipeRouter(pool));

// Routes upload
app.use('/api/upload', creerUploadRouter(pool));

// Routes géofencing (suivi position + alertes sortie zone + roadmap)
app.use('/api/geofencing', creerGeofencingRouter(pool, logger));

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
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS lng,
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS lat,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id) AS missions,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id AND om.statut='en_cours') AS en_cours,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id AND om.statut='en_attente') AS en_attente,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id AND om.statut='bloque') AS bloquee,
              (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.chantier_id=c.id AND om.statut='termine') AS terminee,
              (SELECT COALESCE(e.nom,'Aucune équipe') FROM ordres_de_mission om LEFT JOIN equipes e ON e.id=om.equipe_id
               WHERE om.chantier_id=c.id AND om.statut IN ('en_cours','en_attente') ORDER BY om.date_creation LIMIT 1) AS equipe_actuelle,
              (SELECT om.phase FROM ordres_de_mission om WHERE om.chantier_id=c.id
               AND om.statut IN ('en_cours','en_attente') ORDER BY om.date_creation LIMIT 1) AS phase_actuelle,
              TO_CHAR(c.date_creation,'YYYY-MM-DD HH24:MI') AS date_creation
       FROM chantiers c ORDER BY c.date_creation DESC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ erreur: 'Erreur serveur.', detail: err.message });
  }
});

// POST /api/chantiers/geocode — géocoder les chantiers sans coordonnées
app.post('/api/chantiers/geocode', async (_req, res) => {
  try {
    // Find chantiers with NULL coordinates but an address
    const { rows: missing } = await pool.query(
      `SELECT id, nom_chantier, adresse FROM chantiers
       WHERE coordonnees IS NULL AND adresse IS NOT NULL AND adresse <> ''`
    );
    if (missing.length === 0) {
      return res.json({ message: 'Tous les chantiers ont déjà des coordonnées.', updated: 0 });
    }

    let updated = 0;
    const defaults: Record<string, { lat: number; lng: number }> = {
      'alger': { lat: 36.7535, lng: 3.0588 },
      'oran': { lat: 35.6969, lng: -0.6331 },
      'constantine': { lat: 36.3650, lng: 6.6147 },
      'annaba': { lat: 36.9000, lng: 7.7667 },
      'blida': { lat: 36.4700, lng: 2.8300 },
      'setif': { lat: 36.1900, lng: 5.4100 },
      'batna': { lat: 35.5600, lng: 6.1700 },
      'tlemcen': { lat: 34.8828, lng: -1.3167 },
      'bejaia': { lat: 36.7509, lng: 5.0567 },
      'tizi_ouzou': { lat: 36.7117, lng: 4.0456 },
      'djelfa': { lat: 34.6700, lng: 3.2500 },
      'msila': { lat: 35.7000, lng: 4.5425 },
      'mostaganem': { lat: 35.9333, lng: 0.0833 },
      'relizane': { lat: 35.7333, lng: 0.5500 },
      'chlef': { lat: 36.1650, lng: 1.3317 },
      'tiaret': { lat: 35.3800, lng: 1.3200 },
      'biskra': { lat: 34.8500, lng: 5.7333 },
      'ghardaia': { lat: 32.4900, lng: 3.6700 },
      'ouargla': { lat: 31.9500, lng: 5.3300 },
    };

    for (const chantier of missing) {
      const addr = (chantier.adresse || '').toLowerCase();
      let lat: number | null = null;
      let lng: number | null = null;

      // Try Nominatim geocoding first
      try {
        const q = encodeURIComponent(`${chantier.adresse}, Algeria`);
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=dz`, {
          headers: { 'User-Agent': 'RMASC-OnSite/1.0' },
        });
        const data = await resp.json() as any[];
        if (data.length > 0) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
        }
      } catch (_) { /* Nominatim failed, try defaults */ }

      // Fallback: match city name from address
      if (!lat || !lng) {
        for (const [city, coords] of Object.entries(defaults)) {
          if (addr.includes(city.replace('_', ' '))) {
            lat = coords.lat;
            lng = coords.lng;
            break;
          }
        }
      }

      // Last resort: center of Algeria
      if (!lat || !lng) {
        lat = 36.7535;
        lng = 3.0588;
      }

      await pool.query(
        `UPDATE chantiers SET coordonnees = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        [lng, lat, chantier.id]
      );
      updated++;
      // Respect Nominatim rate limit (1 req/s)
      await new Promise(r => setTimeout(r, 1100));
    }

    res.json({ message: `${updated} chantier(s) géocodé(s).`, updated });
  } catch (err: any) {
    res.status(500).json({ erreur: 'Erreur géocodage.', detail: err.message });
  }
});

// POST /api/chantiers — création manuelle d'un chantier (El Ghani)
app.post('/api/chantiers', async (req, res) => {
  try {
    const { nom, client_nom, adresse, latitude, longitude, rayon_geofencing, complexite, reference_commande_erp, dxfUrl, pdfUrl, ficheTechnique } = req.body;
    if (!nom) {
      return res.status(400).json({ erreur: 'nom requis.' });
    }
    const ref = reference_commande_erp || `MAN-${Date.now().toString().slice(-6)}`;
    const validComplexity = ['FACILE','MOYENNE','DIFFICILE'].includes(complexite) ? complexite : 'MOYENNE';

    // Handle coordinates: if provided, use them; otherwise NULL (no geocoding crash)
    const hasCoords = latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null;
    const { rows } = await pool.query(
      `INSERT INTO chantiers (reference_commande_erp, nom_chantier, adresse, coordonnees,
                              rayon_geofencing, statut, client_nom, complexite,
                              dxf_url, pdf_url, fiche_technique)
       VALUES ($1, $2, $3, ${hasCoords ? 'ST_SetSRID(ST_MakePoint($4, $5), 4326)' : 'NULL'}, $6, 'planifie', $7, $8, $9, $10, $11)
       RETURNING id`,
      [ref, nom, adresse || null, hasCoords ? longitude : null, hasCoords ? latitude : null, rayon_geofencing || 50, client_nom || null, validComplexity,
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

      // 📲 SMS à l'équipe mécanique assignée
      try {
        const telRes = await pool.query(
          `SELECT telephone FROM utilisateurs WHERE equipe_id = $1 AND actif = TRUE
             AND telephone IS NOT NULL AND telephone <> '' ORDER BY date_creation LIMIT 1`,
          [equipe.id]
        );
        await smsService.notifierNouvelleMission({
          equipeId: equipe.id, equipeNom: equipe.nom,
          telephone: telRes.rows[0]?.telephone || null,
          phase: 'mecanique', chantierNom: nom, adresse: adresse || null,
          chantierId: chantierId, missionId: missionId!,
        });
      } catch (smsErr) {
        logger.error('Erreur programmation SMS création chantier', { erreur: (smsErr as any).message });
      }
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
      `SELECT c.*,
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS lng,
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS lat
       FROM chantiers c WHERE c.id = $1`, [req.params.id]
    );
    if (chantierRes.rows.length === 0) return res.status(404).json({ erreur: 'Introuvable.' });
    const chantier = chantierRes.rows[0];

    const missionsRes = await pool.query(
      `SELECT om.id, om.phase, om.statut, om.duree_estimee_jours,
              TO_CHAR(om.date_declenchement,'YYYY-MM-DD HH24:MI') AS date_declenchement,
              TO_CHAR(om.date_debut_effectif,'YYYY-MM-DD HH24:MI') AS date_debut,
              TO_CHAR(om.date_fin_effectif,'YYYY-MM-DD HH24:MI') AS date_fin,
              COALESCE(e.nom, 'Aucune équipe') AS equipe_nom,
              CASE WHEN om.date_fin_effectif IS NOT NULL AND om.duree_estimee_jours IS NOT NULL
                   THEN EXTRACT(DAY FROM om.date_fin_effectif - om.date_debut_effectif) - om.duree_estimee_jours
                   ELSE NULL END AS retard_jours,
              cl.etapes AS checklist_etapes,
              cl.complete AS checklist_complete
       FROM ordres_de_mission om
       LEFT JOIN equipes e ON e.id = om.equipe_id
       LEFT JOIN LATERAL (
         SELECT etapes, complete FROM checklists_phases cp
         WHERE cp.mission_id = om.id ORDER BY cp.date_mise_a_jour DESC LIMIT 1
       ) cl ON true
       WHERE om.chantier_id = $1 ORDER BY om.date_creation`, [req.params.id]
    );

    // Calculer la progression + étape actuelle par mission
    const missions = missionsRes.rows.map((m: any) => {
      let progression = 0;
      let etapeActuelle = '';
      let etapeSuivante = '';
      let sousTacheActuelle = '';
      if (m.checklist_etapes) {
        const etapes = Array.isArray(m.checklist_etapes) ? m.checklist_etapes : JSON.parse(m.checklist_etapes || '[]');
        const done = etapes.filter((e: any) => e.done).length;
        progression = etapes.length > 0 ? Math.round((done / etapes.length) * 100) : 0;

        // Étape actuelle = première non-complétée
        for (const e of etapes) {
          const eComplete = e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done));
          if (!eComplete) {
            etapeActuelle = e.label;
            // Sous-tâche actuelle si l'étape a des subtasks
            if (e.subtasks) {
              const sub = e.subtasks.find((s: any) => !s.done);
              if (sub) sousTacheActuelle = sub.label;
            }
            break;
          }
        }
        // Étape suivante = après la dernière complétée
        const lastDone = [...etapes].reverse().find((e: any) => e.done);
        if (lastDone) {
          const idx = etapes.findIndex((e: any) => e.id === lastDone.id);
          if (idx >= 0 && idx + 1 < etapes.length && etapes.every((e: any, i: number) => i <= idx ? (e.done && (!e.subtasks || e.subtasks.every((s: any) => s.done))) : true)) {
            etapeSuivante = etapes[idx + 1].label;
          }
        }
      }
      if (m.statut === 'termine') { progression = 100; etapeActuelle = ''; etapeSuivante = ''; }
      return { ...m, progression, etapeActuelle, etapeSuivante, sousTacheActuelle };
    });

    res.json({ chantier, missions });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// ─── Dashboard statique (Next.js static export) ──────────────────────
// Le build Next.js génère des fichiers HTML/CSS/JS dans dashboard/out/.
// Express les sert directement — pas de serveur Next.js séparé.
// Un seul processus, un seul port, un seul PM2.
const DASHBOARD_OUT = path.join(__dirname, '..', '..', 'dashboard', 'out');

// 1. Servir les fichiers existants (HTML, CSS, JS, images)
//    extensions: ['html'] permet à /dashboard de servir dashboard.html
app.use(express.static(DASHBOARD_OUT, { extensions: ['html'] }));

// 2. Fallback SPA — pour les routes client-side du dashboard
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  // Dashboard routes: /dashboard/*, /login, /mission/*
  if (req.path.startsWith('/dashboard') || req.path === '/login' || req.path.startsWith('/mission')) {
    return res.sendFile(path.join(DASHBOARD_OUT, 'index.html'));
  }
  next();
});

// 3. Pages Web server-side (chantiers, missions, détails) — after dashboard
app.use('/', creerPages(pool));

// Webhook ERP — appelé par l'ERP quand une commande est terminée
app.post('/api/webhook/erp', creerWebhookHandler(
  pool, chantierRepo, missionRepo, equipeRepo, logger, ERP_WEBHOOK_SECRET
));

// 4. Fallback final — dashboard index.html pour toute autre route
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ erreur: 'Route API introuvable.' });
  }
  res.sendFile(path.join(DASHBOARD_OUT, 'index.html'));
});

// Démarrer le serveur
const port = parseInt(PORT, 10);
app.listen(port, () => {
  logger.info(`RMASC OnSite — Serveur démarré sur le port ${port}`);
  pool.query('SELECT 1')
    .then(() => logger.info('PostgreSQL OK'))
    .catch(e => logger.error('PostgreSQL', { erreur: e.message }));
  // Démarrer le worker SMS (file d'attente sms_outbox)
  const smsWorker = new SmsWorker(pool, smsService, logger);
  smsWorker.demarrer();
});

export { app };
