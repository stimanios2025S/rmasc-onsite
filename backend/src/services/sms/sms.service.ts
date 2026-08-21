import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';
import { DryRunProvider } from './providers/dryrun.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { normaliserTelephone } from './providers/sms.provider.types';
import type { SmsProvider } from './providers/sms.provider.types';

export interface SmsConfig {
  fournisseur: 'twilio' | 'simulation';
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
}

export interface ProgrammerSmsParams {
  telephone: string | null | undefined;
  destinataireNom?: string | null;
  contenu: string;
  typeEvenement: string;
  chantierId?: string | null;
  missionId?: string | null;
  equipeId?: string | null;
}

/**
 * SmsService — programmation des SMS dans sms_outbox (file d'attente).
 * Le worker (sms.worker.ts) envoie réellement via le provider configuré.
 */
export class SmsService {
  readonly provider: SmsProvider;

  constructor(
    private readonly pool: Pool,
    private readonly logger: LoggerService,
    config: SmsConfig = { fournisseur: 'simulation' }
  ) {
    if (config.fournisseur === 'twilio' && config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber) {
      this.provider = new TwilioProvider(config.twilioAccountSid, config.twilioAuthToken, config.twilioFromNumber);
      this.logger.info('SMS: provider Twilio ACTIF');
    } else {
      this.provider = new DryRunProvider(this.logger);
      this.logger.warn('SMS: provider SIMULATION (Twilio non configuré) — aucun SMS réel envoyé');
    }
  }

  /** Programme un SMS dans la file (ne fait aucun HTTP). */
  async programmer(p: ProgrammerSmsParams): Promise<void> {
    const tel = normaliserTelephone(p.telephone);
    if (!tel) {
      this.logger.debug('SMS ignoré — pas de numéro', { type: p.typeEvenement, chantierId: p.chantierId });
      return;
    }
    await this.pool.query(
      `INSERT INTO sms_outbox (telephone, destinataire_nom, contenu, type_evenement, chantier_id, mission_id, equipe_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tel, p.destinataireNom || null, p.contenu, p.typeEvenement, p.chantierId || null, p.missionId || null, p.equipeId || null]
    );
    this.logger.info('SMS programmé', { type: p.typeEvenement, tel, chantierId: p.chantierId });
  }

  // ─── Messages types ───────────────────────────────────────────────────

  /** SMS à l'équipe quand une mission lui est assignée. */
  async notifierNouvelleMission(args: {
    equipeId: string; equipeNom: string; telephone: string | null;
    phase: string; chantierNom: string; adresse?: string | null;
    chantierId: string; missionId: string;
  }): Promise<void> {
    await this.programmer({
      telephone: args.telephone,
      destinataireNom: args.equipeNom,
      contenu: `🛗 RMASC: NOUVELLE MISSION ${args.phase.toUpperCase()} — "${args.chantierNom}" à ${args.adresse || 'adresse à confirmer'}. Équipe ${args.equipeNom}. Ordre disponible dans votre app. — El Ghani`,
      typeEvenement: 'mission_assignee',
      chantierId: args.chantierId, missionId: args.missionId, equipeId: args.equipeId,
    });
  }

  /** SMS au propriétaire (admin/dispatcher) — mission terminée. */
  async notifierMissionTerminee(args: {
    telephone: string; destinataireNom: string;
    phase: string; chantierNom: string; equipeNom: string;
    chantierId: string; missionId: string;
  }): Promise<void> {
    await this.programmer({
      telephone: args.telephone,
      destinataireNom: args.destinataireNom,
      contenu: `✅ RMASC: Phase ${args.phase.toUpperCase()} TERMINÉE sur "${args.chantierNom}" — équipe ${args.equipeNom}.`,
      typeEvenement: 'mission_terminee',
      chantierId: args.chantierId, missionId: args.missionId,
    });
  }

  /** SMS au client — chantier réceptionné. */
  async notifierReception(args: {
    telephone: string | null; destinataireNom?: string | null;
    chantierNom: string; chantierId: string; missionId?: string | null;
  }): Promise<void> {
    await this.programmer({
      telephone: args.telephone,
      destinataireNom: args.destinataireNom,
      contenu: `🎉 Bonjour ${args.destinataireNom || 'cher client'}, votre ascenseur sur "${args.chantierNom}" est TERMINÉ et officiellement réceptionné. Merci de votre confiance — RMASC.`,
      typeEvenement: 'chantier_receptionne',
      chantierId: args.chantierId, missionId: args.missionId || null,
    });
  }
}
