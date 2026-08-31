import { LoggerService } from '../../notifications/logger.service';
import type { EnvoiSmsResultat, SmsProvider } from './sms.provider.types';

/**
 * Provider SIMULATION — aucun SMS réel n'est envoyé.
 * Utilisé par défaut tant que Twilio n'est pas configuré (SMTP de test).
 * Les messages sont loggés et marqués ENVOYE en base pour valider le flux.
 */
export class DryRunProvider implements SmsProvider {
  readonly nom = 'simulation';

  constructor(private readonly logger: LoggerService) {}

  async envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat> {
    this.logger.info(`[SMS·SIMULATION] → ${telephone}`, { contenu });
    return { ok: true, fournisseur: this.nom, messageId: `sim-${Date.now()}` };
  }
}
