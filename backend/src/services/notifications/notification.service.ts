import type { NotificationPush, WebhookERP } from '../../types/evenements.types';
import { LoggerService } from './logger.service';

export class NotificationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly options: {
      erpWebhookUrl?: string;
      erpWebhookSecret?: string;
      wsEmetteur?: (canal: string, donnees: unknown) => Promise<void>;
    } = {}
  ) {}

  async envoyerPush(notification: NotificationPush): Promise<void> {
    if (notification.destinataires.length === 0) {
      this.logger.warn('Push sans destinataire', { titre: notification.titre });
      return;
    }
    this.logger.info(`Push: "${notification.titre}" — ${notification.destinataires.length} dest.`);
  }

  async emettreTableauBord(canal: string, donnees: Record<string, unknown>): Promise<void> {
    if (this.options.wsEmetteur) {
      await this.options.wsEmetteur(canal, donnees);
    }
    this.logger.debug(`WS: ${canal}`);
  }

  async envoyerWebhookERP(payload: WebhookERP): Promise<void> {
    const url = this.options.erpWebhookUrl;
    if (!url) { this.logger.warn('ERP_WEBHOOK_URL non configuré'); return; }
    this.logger.info(`Webhook ERP: ${payload.evenement} -> ${url}`);
  }

  async alerterDispatcher(d: { type: string; titre: string; message: string; priorite?: string; missionId: string; chantierId?: string; donneesComplement?: Record<string, unknown> }): Promise<void> {
    await this.emettreTableauBord('dashboard:alerte', {
      type: d.type, titre: d.titre, message: d.message, priorite: d.priorite ?? 'normale',
      missionId: d.missionId, chantierId: d.chantierId, horodatage: new Date().toISOString(),
      ...d.donneesComplement,
    });
    this.logger.warn(`Alerte dispatcher: ${d.titre}`);
  }

  async alerterResponsableQA(d: { chantierId: string; missionId: string; message: string }): Promise<void> {
    await this.envoyerPush({
      titre: '✅ Verification QA requise', corps: d.message, destinataires: [],
      donnees: { type: 'qa_required', chantierId: d.chantierId, missionId: d.missionId },
    });
  }
}
