import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
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
import { creerTrackingRouter } from './api/tracking.controller';
import { creerMaterielRouter } from './api/materiel.controller';
import { creerTeamManagementRouter } from './api/team-management.controller';
import { creerMagasinierRouter } from './api/magasinier.controller';
import { SmsService } from './services/sms/sms.service';
import { SmsWorker } from './services/sms/sms.worker';
import path from 'path';
import https from 'https';
import { creerPages } from './views';
import { verifierToken } from './middleware/auth.middleware';

const {
  DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'rmasc_onsite',
  DB_USER = 'rmasc', DB_PASSWORD = '', ERP_WEBHOOK_URL = '', ERP_WEBHOOK_SECRET = '',
  JWT_SECRET = 'rmasc-onsite-jwt-secret',
  SMS_PROVIDER = 'simulation', TWILIO_ACCOUNT_SID = '', TWILIO_AUTH_TOKEN = '', TWILIO_FROM_NUMBER = '', TWILIO_CONTENT_SID = '',
  PORT = '4000',
} = process.env;

const pool = new Pool({
  host: DB_HOST, port: parseInt(DB_PORT, 10), database: DB_NAME,
  user: DB_USER, password: DB_PASSWORD, max: 30,
  idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000,
  statement_timeout: 15000, // 15s per query max
});

const logger = new LoggerService('RMASC-OnSite');
const notifier = new NotificationService(logger, { erpWebhookUrl: ERP_WEBHOOK_URL, erpWebhookSecret: ERP_WEBHOOK_SECRET });

// ─── Service SMS (file d'attente + worker d'envoi) ────────────────────
const smsService = new SmsService(pool, logger, {
  fournisseur: (SMS_PROVIDER === 'twilio' ? 'twilio' : SMS_PROVIDER === 'twilio-whatsapp' ? 'twilio-whatsapp' : 'simulation'),
  twilioAccountSid: TWILIO_ACCOUNT_SID,
  twilioAuthToken: TWILIO_AUTH_TOKEN,
  twilioFromNumber: TWILIO_FROM_NUMBER,
  twilioContentSid: TWILIO_CONTENT_SID,
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
  keyGenerator: (req: any) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => req.path === '/api/health' || req.path === '/api/auth/login', // ne pas bloquer health + login
});
app.use('/api', limiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rmasc-onsite', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════════
// SSE — Server-Sent Events pour synchronisation temps réel
// ═══════════════════════════════════════════════════════════════════════════
import { eventBus } from './services/events/event-bus';

app.get('/api/sync/events', (req, res) => {
  // EventSource can't set headers, so accept token via query param
  const token = (req.query.token as string) || req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ erreur: 'Token manquant.' });
    return;
  }
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET || 'rmasc-onsite-secret-change-in-production');
  } catch {
    res.status(401).json({ erreur: 'Token invalide ou expiré.' });
    return;
  }
  (req as any).user = user;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // initial keepalive

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  const unsubscribe = eventBus.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  logger.info('SSE client connecté', { total: eventBus.listenerCount });

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.info('SSE client déconnecté', { total: eventBus.listenerCount });
  });
});

// Routes d'authentification
app.use('/api/auth', creerAuthRouter(pool, logger));

// Routes admin (El Ghani — protégées par JWT)
app.use('/api/admin', creerAdminRouter(pool, logger, smsService));

// Routes mission (technicien mobile)
app.use('/api/mission', creerMissionRouter(pool, logger, smsService));

// Routes équipe (statut, repos)
app.use('/api/equipe', creerEquipeRouter(pool));

// Routes upload
app.use('/api/upload', creerUploadRouter(pool));

// Routes géofencing (suivi position + alertes sortie zone + roadmap)
app.use('/api/geofencing', creerGeofencingRouter(pool, logger));

// Routes tracking (GPS en route, pointage jour, pause, transfert)
app.use('/api/tracking', creerTrackingRouter(pool, logger, smsService));

// Routes demandes matériel / signalements
app.use('/api/materiel', creerMaterielRouter(pool, logger, smsService));

// Routes team management (admin)
app.use('/api/admin/teams', creerTeamManagementRouter(pool, logger));

// Routes magasinier (warehouse manager — auth + portal + admin management)
app.use('/api/magasinier', creerMagasinierRouter(pool, logger));

// Static files (uploads) — same dir as upload.controller.ts (backend/public/uploads)
const UPLOADS_DIR = path.resolve(__dirname, '../public/uploads');
if (!require('fs').existsSync(UPLOADS_DIR)) require('fs').mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Route API chantiers (avec coordonnées pour la carte) — OPTIMISÉ: 1 query au lieu de 5+8
app.get('/api/chantiers', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `WITH mission_stats AS (
         SELECT chantier_id,
                COUNT(*)::INT AS missions,
                COUNT(*) FILTER (WHERE statut='en_cours')::INT AS en_cours,
                COUNT(*) FILTER (WHERE statut='en_attente')::INT AS en_attente,
                COUNT(*) FILTER (WHERE statut='bloque')::INT AS bloquee,
                COUNT(*) FILTER (WHERE statut='termine')::INT AS terminee
         FROM ordres_de_mission GROUP BY chantier_id
       ),
       active_mission AS (
         SELECT DISTINCT ON (om.chantier_id)
           om.chantier_id, e.nom AS equipe_actuelle, om.phase AS phase_actuelle
         FROM ordres_de_mission om
         LEFT JOIN equipes e ON e.id = om.equipe_id
         WHERE om.statut IN ('en_route','en_cours','en_attente','en_pause')
         ORDER BY om.chantier_id, om.date_creation DESC
       )
       SELECT c.id, c.reference_commande_erp AS ref, c.nom_chantier AS nom, c.statut,
              c.client_nom, c.complexite, c.dxf_url AS dxf, c.pdf_url AS pdf,
              c.adresse,
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS lng,
              CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS lat,
              COALESCE(ms.missions, 0) AS missions,
              COALESCE(ms.en_cours, 0) AS en_cours,
              COALESCE(ms.en_attente, 0) AS en_attente,
              COALESCE(ms.bloquee, 0) AS bloquee,
              COALESCE(ms.terminee, 0) AS terminee,
              COALESCE(am.equipe_actuelle, 'Aucune équipe') AS equipe_actuelle,
              am.phase_actuelle,
              TO_CHAR(c.date_creation,'YYYY-MM-DD HH24:MI') AS date_creation
       FROM chantiers c
       LEFT JOIN mission_stats ms ON ms.chantier_id = c.id
       LEFT JOIN active_mission am ON am.chantier_id = c.id
       ORDER BY c.date_creation DESC`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ erreur: 'Erreur serveur.', detail: err.message });
  }
});

// ─── DASHBOARD ALL-IN-ONE — 1 seule requête pour tout le dashboard ──────
// Resilient: each sub-query is independent — if one fails, others still return data
app.get('/api/dashboard/all', async (_req, res) => {
  // Helper: run query and return { rows } on error (never throws)
  const safe = (p: Promise<any>): Promise<{ rows: any[] }> =>
    p.catch((e) => { console.error('[dashboard/all] query error:', e.message); return { rows: [] }; });

  try {
    // Run all queries in parallel — EXACTLY 8 items, matched to destructuring below
    const results = await Promise.all([
      // [0] Chantiers with mission counts (CTE) + blockage info
      safe(pool.query(
        `WITH ms AS (
           SELECT chantier_id,
                  COUNT(*)::INT AS missions,
                  COUNT(*) FILTER (WHERE statut='en_cours')::INT AS en_cours,
                  COUNT(*) FILTER (WHERE statut='en_attente')::INT AS en_attente,
                  COUNT(*) FILTER (WHERE statut='bloque')::INT AS bloquee,
                  COUNT(*) FILTER (WHERE statut='termine')::INT AS terminee
           FROM ordres_de_mission GROUP BY chantier_id
         ),
         am AS (
           SELECT DISTINCT ON (om.chantier_id) om.chantier_id, om.id AS mission_id,
                  e.nom AS equipe_actuelle, om.phase AS phase_actuelle, om.statut AS mission_statut
           FROM ordres_de_mission om LEFT JOIN equipes e ON e.id=om.equipe_id
           WHERE om.statut IN ('en_route','en_cours','en_attente','en_pause','bloque')
           ORDER BY om.chantier_id, om.date_creation DESC
         ),
         cl AS (
           SELECT DISTINCT ON (am.chantier_id) am.chantier_id, cp.etapes, cp.complete
           FROM am
           JOIN checklists_phases cp ON cp.mission_id = am.mission_id
           ORDER BY am.chantier_id, cp.date_mise_a_jour DESC
         ),
         bl AS (
           SELECT om.chantier_id,
                  STRING_AGG(b.raison_blocage, ' | ' ORDER BY b.date_creation) AS motifs_blocage,
                  COUNT(*)::INT AS nb_blocages,
                  STRING_AGG(b.id::text, ',' ORDER BY b.date_creation) AS blocage_ids
           FROM blocages_et_requisitions b
           JOIN ordres_de_mission om ON om.id = b.ordre_mission_id
           WHERE b.statut IN ('ouvert','en_cours')
           GROUP BY om.chantier_id
         )
         SELECT c.id, c.reference_commande_erp AS ref, c.nom_chantier AS nom, c.statut,
                c.client_nom, c.complexite, c.dxf_url AS dxf, c.pdf_url AS pdf, c.adresse,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_X(c.coordonnees::geometry) END AS lng,
                CASE WHEN c.coordonnees IS NOT NULL THEN ST_Y(c.coordonnees::geometry) END AS lat,
                COALESCE(ms.missions,0) AS missions, COALESCE(ms.en_cours,0) AS en_cours,
                COALESCE(ms.en_attente,0) AS en_attente, COALESCE(ms.bloquee,0) AS bloquee,
                COALESCE(ms.terminee,0) AS terminee,
                COALESCE(am.equipe_actuelle,'Aucune') AS equipe_actuelle, am.phase_actuelle, am.mission_statut,
                am.mission_id,
                cl.etapes AS checklist_etapes, cl.complete AS checklist_complete,
                TO_CHAR(c.date_creation,'YYYY-MM-DD HH24:MI') AS date_creation,
                TO_CHAR(c.date_echeance,'YYYY-MM-DD"T"HH24:MI') AS date_echeance,
                bl.motifs_blocage, bl.nb_blocages, bl.blocage_ids
         FROM chantiers c
         LEFT JOIN ms ON ms.chantier_id=c.id
         LEFT JOIN am ON am.chantier_id=c.id
         LEFT JOIN cl ON cl.chantier_id=c.id
         LEFT JOIN bl ON bl.chantier_id=c.id
         ORDER BY c.date_creation DESC`
      )),
      // [1] Chantiers stats — use statut::text to avoid enum validation errors
      safe(pool.query(`SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE statut::text='en_cours') AS en_cours,
        COUNT(*) FILTER (WHERE statut::text IN ('suspendu','bloque')) AS bloques
        FROM chantiers`)),
      // [2] Missions stats
      safe(pool.query(`SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE statut='en_cours') AS en_cours
        FROM ordres_de_mission`)),
      // [3] Equipes list (with member names + today's pointage times)
      safe(pool.query(
        `SELECT e.id, e.nom, e.type, e.statut_equipe,
                e.jours_repos,
                (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.equipe_id=e.id AND om.statut IN ('en_cours','en_attente'))::INT AS missions,
                CASE WHEN e.disponible_a_partir_de > NOW()
                  THEN EXTRACT(DAY FROM e.disponible_a_partir_de - NOW())::INT ELSE 0 END AS jours_repos_restants,
                (SELECT STRING_AGG(u.prenom || ' ' || u.nom, ', ' ORDER BY u.nom)
                 FROM utilisateurs u WHERE u.equipe_id = e.id AND u.actif = TRUE) AS membres_noms,
                -- Today's pointage matinal
                (SELECT TO_CHAR(pj.horodatage,'HH24:MI') FROM pointages_jour pj
                 WHERE pj.equipe_id = e.id AND pj.type_pointage = 'matinal' AND DATE(pj.horodatage) = CURRENT_DATE
                 ORDER BY pj.horodatage DESC LIMIT 1) AS pointage_matinal,
                -- Today's pointage fin_journee
                (SELECT TO_CHAR(pj.horodatage,'HH24:MI') FROM pointages_jour pj
                 WHERE pj.equipe_id = e.id AND pj.type_pointage = 'fin_journee' AND DATE(pj.horodatage) = CURRENT_DATE
                 ORDER BY pj.horodatage DESC LIMIT 1) AS pointage_fin_journee
         FROM equipes e ORDER BY e.type, e.nom`
      )),
      // [4] Demandes (use reference_commande_erp, not reference_erp)
      safe(pool.query(
        `SELECT di.id, di.reference_commande_erp AS ref, di.client_nom, di.nom_chantier, di.statut,
                TO_CHAR(di.date_creation,'YYYY-MM-DD HH24:MI') AS cree
         FROM demandes_integration di WHERE di.statut='EN_ATTENTE_VALIDATION'`
      )),
      // [4b] Demandes matériel (from worker portal)
      safe(pool.query(
        `SELECT dm.id, dm.type_demande, dm.statut, dm.description, dm.items,
                dm.photo_url, dm.pdf_url, e.nom AS equipe_nom, e.type AS equipe_type,
                c.nom_chantier AS chantier_nom,
                TO_CHAR(dm.date_creation,'YYYY-MM-DD HH24:MI') AS cree
         FROM demandes_materiel dm
         LEFT JOIN equipes e ON e.id = dm.equipe_id
         LEFT JOIN chantiers c ON c.id = dm.chantier_id
         WHERE dm.statut IN ('EN_ATTENTE','EN_PREPARATION','EXPEDIE')
         ORDER BY dm.date_creation DESC LIMIT 20`
      )),
      // [5] Incidents (blocages + pauses + retards + matériel) — all include photo_url + blocage_id
      safe(pool.query(`
         SELECT 'blocage' AS type, b.priorite::text, b.raison_blocage AS message, c.nom_chantier,
                 e.nom AS equipe_nom, TO_CHAR(b.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
                 b.photo_proof_url AS photo_url, b.id AS blocage_id
          FROM blocages_et_requisitions b
          JOIN ordres_de_mission om ON om.id=b.ordre_mission_id
          JOIN chantiers c ON c.id=om.chantier_id
          LEFT JOIN equipes e ON e.id=om.equipe_id
          WHERE b.statut IN ('ouvert','en_cours')
         UNION ALL
         SELECT 'pause' AS type, 'basse'::text,
                 p.type_pause || ' — ' || COALESCE(e2.nom, 'Équipe') AS message,
                 COALESCE(c2.nom_chantier, 'N/A') AS nom_chantier,
                 e2.nom AS equipe_nom,
                 TO_CHAR(p.date_debut,'YYYY-MM-DD HH24:MI') AS moment,
                 NULL::text AS photo_url, NULL::text AS blocage_id
          FROM pauses_journee p
          LEFT JOIN equipes e2 ON e2.id = p.equipe_id
          LEFT JOIN ordres_de_mission om2 ON om2.id = p.mission_id
          LEFT JOIN chantiers c2 ON c2.id = om2.chantier_id
          WHERE p.date_fin IS NULL
         UNION ALL
         SELECT 'reprise' AS type, 'basse'::text,
                 'Reprise — ' || COALESCE(e3.nom, 'Équipe') AS message,
                 COALESCE(c3.nom_chantier, 'N/A') AS nom_chantier,
                 e3.nom AS equipe_nom,
                 TO_CHAR(p3.date_fin,'YYYY-MM-DD HH24:MI') AS moment,
                 NULL::text AS photo_url, NULL::text AS blocage_id
          FROM pauses_journee p3
          LEFT JOIN equipes e3 ON e3.id = p3.equipe_id
          LEFT JOIN ordres_de_mission om3 ON om3.id = p3.mission_id
          LEFT JOIN chantiers c3 ON c3.id = om3.chantier_id
          WHERE p3.date_fin IS NOT NULL AND p3.date_fin > NOW() - INTERVAL '24 hours'
         UNION ALL
         SELECT 'materiel' AS type, 'moyenne'::text,
                 dm.description AS message,
                 COALESCE(c4.nom_chantier, 'N/A') AS nom_chantier,
                 e4.nom AS equipe_nom,
                 TO_CHAR(dm.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
                 dm.photo_url, NULL::text AS blocage_id
          FROM demandes_materiel dm
          LEFT JOIN equipes e4 ON e4.id = dm.equipe_id
          LEFT JOIN chantiers c4 ON c4.id = dm.chantier_id
          WHERE dm.statut IN ('EN_ATTENTE','EN_PREPARATION','EXPEDIE')
         UNION ALL
         SELECT 'retard' AS type, 'haute'::text,
                 nr.motif AS message,
                 c.nom_chantier, e.nom AS equipe_nom,
                 TO_CHAR(nr.date_creation,'YYYY-MM-DD HH24:MI') AS moment,
                 nr.photo_url, NULL::text AS blocage_id
          FROM notifications_retard nr
          JOIN chantiers c ON c.id = nr.chantier_id
          JOIN equipes e ON e.id = nr.equipe_id
          WHERE nr.date_creation > NOW() - INTERVAL '7 days'
          ORDER BY moment DESC LIMIT 50
        `
      )),
      // [6] Team positions (GPS tracking)
      safe(pool.query(
        `WITH dp AS (
           SELECT DISTINCT ON (gt.equipe_id)
             gt.equipe_id, gt.latitude, gt.longitude, gt.vitesse_kmh, gt.batterie_pct,
             gt.date_creation AS last_update,
             om.id AS mission_id, om.statut AS mission_statut,
             c.nom_chantier AS destination
           FROM gps_tracking gt
           LEFT JOIN ordres_de_mission om ON om.id=gt.mission_id AND om.statut IN ('en_route','en_cours','en_attente','en_pause')
           LEFT JOIN chantiers c ON c.id=om.chantier_id
           WHERE gt.date_creation > NOW() - INTERVAL '4 hours'
           ORDER BY gt.equipe_id, gt.date_creation DESC
         )
         SELECT dp.*, e.nom AS equipe_nom, e.type AS equipe_type, eqs.statut_equipe
         FROM dp
         JOIN equipes e ON e.id=dp.equipe_id
         LEFT JOIN equipes eqs ON eqs.id=dp.equipe_id`
      )),
    ]);

    // Destructure: matches the 8 queries above
    const [chantiersRes, chantiersStat, missionsStat, equipesRes, demandesRes, materielRes, incidentsRes, teamsRes] = results;

    // Safe number extraction
    const num = (r: any, col = 'total') => Number(r?.rows?.[0]?.[col] ?? 0);

    res.json({
      chantiers: chantiersRes.rows || [],
      stats: {
        chantiersTotal: num(chantiersStat),
        chantiersActifs: num(chantiersStat, 'en_cours'),
        chantiersBloques: num(chantiersStat, 'bloques'),
        missionsTotal: num(missionsStat),
        missionsEnCours: num(missionsStat, 'en_cours'),
        demandesEnAttente: (demandesRes.rows?.length ?? 0) + (materielRes.rows?.length ?? 0),
        blocagesOuverts: incidentsRes.rows?.length ?? 0,
        blocagesTotal: incidentsRes.rows?.length ?? 0,
        equipesDisponibles: equipesRes.rows?.filter((e: any) => e.statut_equipe === 'DISPONIBLE').length ?? 0,
      },
      equipes: equipesRes.rows || [],
      demandesMateriel: materielRes.rows || [],
      demandes: demandesRes.rows || [],
      incidents: incidentsRes.rows || [],
      teamPositions: teamsRes.rows || [],
    });
  } catch (err: any) {
    console.error('[dashboard/all] fatal:', err.message);
    res.status(500).json({ erreur: 'Erreur serveur.', detail: err.message });
  }
});

// POST /api/chantiers/geocode — géocoder les chantiers sans coordonnées (admin only)
app.post('/api/chantiers/geocode', verifierToken, async (_req, res) => {
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
        const data = await new Promise<any[]>((resolve, reject) => {
          https.get(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=dz`, {
            headers: { 'User-Agent': 'RMASC-OnSite/1.0' },
          }, (resp) => {
            let body = '';
            resp.on('data', (chunk) => body += chunk);
            resp.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve([]); } });
          }).on('error', () => resolve([]));
        });
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
app.post('/api/chantiers', verifierToken, async (req, res) => {
  try {
    const { nom, client_nom, adresse, latitude, longitude, rayon_geofencing, complexite, reference_commande_erp, dxfUrl, pdfUrl, ficheTechnique, date_echeance, forceEquipeId } = req.body;
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
                              dxf_url, pdf_url, fiche_technique, date_echeance)
       VALUES ($1, $2, $3, ${hasCoords ? 'ST_SetSRID(ST_MakePoint($4, $5), 4326)' : 'NULL'}, $6, 'planifie', $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [ref, nom, adresse || null, hasCoords ? longitude : null, hasCoords ? latitude : null, rayon_geofencing || 50, client_nom || null, validComplexity,
       dxfUrl || null, pdfUrl || null, ficheTechnique ? JSON.stringify({ spec: ficheTechnique }) : null, date_echeance || null]
    );
    const chantierId = rows[0].id;

    // Assigner une équipe mécanique — use forceEquipeId if provided (admin override for EN_REPOS teams)
    let equipeResult;
    if (forceEquipeId) {
      equipeResult = await pool.query(
        `SELECT e.id, e.nom FROM equipes e
         WHERE e.id = $1 AND e.type = 'mecanique' AND e.actif = TRUE`,
        [forceEquipeId]
      );
    } else {
      equipeResult = await pool.query(
        `SELECT e.id, e.nom FROM equipes e
         WHERE e.type = 'mecanique' AND e.actif = TRUE
           AND e.statut_equipe = 'DISPONIBLE' AND e.disponible_a_partir_de <= NOW()
         ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om
                   WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC,
                  e.date_creation ASC
         LIMIT 1`
      );
    }

    let missionId: string | null = null;
    let equipeNom: string | null = null;
    if (equipeResult.rows.length > 0) {
      const equipe = equipeResult.rows[0];
      await pool.query(`UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = $1`, [equipe.id]);
      const missionResult = await pool.query(
        `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, date_echeance)
         VALUES ($1, $2, 'mecanique', 'en_attente', NOW(),
                 (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = 'mecanique'), $3)
         RETURNING id`,
        [chantierId, equipe.id, date_echeance || null]
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
app.put('/api/chantiers/:id', verifierToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, client_nom, adresse, latitude, longitude, rayon_geofencing, complexite, dxfUrl, pdfUrl, ficheTechnique, date_echeance } = req.body;
    if (!nom) return res.status(400).json({ erreur: 'nom requis.' });

    const validComplexity = ['FACILE','MOYENNE','DIFFICILE'].includes(complexite) ? complexite : 'MOYENNE';
    const lat = (latitude !== undefined && latitude !== null && !isNaN(latitude)) ? Number(latitude) : null;
    const lng = (longitude !== undefined && longitude !== null && !isNaN(longitude)) ? Number(longitude) : null;

    await pool.query(
      `UPDATE chantiers SET
         nom_chantier = $1, client_nom = COALESCE($2, client_nom), adresse = COALESCE($3, adresse),
         rayon_geofencing = $4, complexite = $5,
         dxf_url = COALESCE($6, dxf_url), pdf_url = COALESCE($7, pdf_url),
         fiche_technique = COALESCE($8, fiche_technique),
         coordonnees = CASE WHEN $9::float8 IS NOT NULL AND $10::float8 IS NOT NULL
                            THEN ST_SetSRID(ST_MakePoint($10, $9), 4326)
                            ELSE coordonnees END,
         date_echeance = $12,
         date_modification = NOW()
       WHERE id = $11`,
      [nom, client_nom || null, adresse || null, rayon_geofencing || 50, validComplexity,
       dxfUrl || null, pdfUrl || null, ficheTechnique ? JSON.stringify({ spec: ficheTechnique }) : null,
       lat, lng, id, date_echeance || null]
    );
    res.json({ message: `Chantier "${nom}" mis à jour.` });
  } catch (err: any) {
    res.status(500).json({ erreur: err.message });
  }
});

// DELETE /api/chantiers/:id — supprimer un chantier (El Ghani)
app.delete('/api/chantiers/:id', verifierToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Trouver les équipes qui ont des missions actives sur ce chantier
    const { rows: equipeIds } = await pool.query(
      `SELECT DISTINCT om.equipe_id
       FROM ordres_de_mission om
       WHERE om.chantier_id = $1 AND om.statut IN ('en_attente','en_cours','en_route','en_pause','bloque')`,
      [id]
    );

    // 2. Supprimer le chantier (cascade supprime aussi les missions, pointages, etc.)
    await pool.query(`DELETE FROM chantiers WHERE id = $1`, [id]);

    // 3. Pour chaque équipe affectée, vérifier si elle a encore d'autres missions actives
    //    Sinon, la remettre DISPONIBLE
    for (const row of equipeIds) {
      const { rows: autres } = await pool.query(
        `SELECT 1 FROM ordres_de_mission WHERE equipe_id = $1
         AND statut IN ('en_attente','en_cours','en_route','en_pause','bloque') LIMIT 1`,
        [row.equipe_id]
      );
      if (autres.length === 0) {
        await pool.query(
          `UPDATE equipes
           SET statut_equipe = 'DISPONIBLE',
               disponible_a_partir_de = NOW(),
               date_modification = NOW()
           WHERE id = $1 AND statut_equipe != 'DISPONIBLE'`,
          [row.equipe_id]
        );
      }
    }

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
              TO_CHAR(om.date_echeance,'YYYY-MM-DD') AS date_echeance,
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
      let etapePrecedente = '';
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
        // Étape précédente = celle juste avant l'étape actuelle
        if (etapeActuelle) {
          const currentIdx = etapes.findIndex((e: any) => e.label === etapeActuelle);
          if (currentIdx > 0) {
            etapePrecedente = etapes[currentIdx - 1].label;
          }
        }
        // Étape suivante = celle juste après l'étape actuelle
        if (etapeActuelle) {
          const currentIdx = etapes.findIndex((e: any) => e.label === etapeActuelle);
          if (currentIdx >= 0 && currentIdx + 1 < etapes.length) {
            etapeSuivante = etapes[currentIdx + 1].label;
          }
        }
      }
      if (m.statut === 'termine') { progression = 100; etapeActuelle = ''; etapeSuivante = ''; etapePrecedente = ''; }
      return { ...m, progression, etapeActuelle, etapeSuivante, etapePrecedente, sousTacheActuelle };
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
