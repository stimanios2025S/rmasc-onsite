import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
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
import { creerPages } from './views';

const {
  DB_HOST = 'localhost', DB_PORT = '5432', DB_NAME = 'rmasc_onsite',
  DB_USER = 'rmasc', DB_PASSWORD = '', ERP_WEBHOOK_URL = '', ERP_WEBHOOK_SECRET = '',
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rmasc-onsite', timestamp: new Date().toISOString() });
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
