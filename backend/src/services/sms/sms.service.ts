import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';
import { DryRunProvider } from './providers/dryrun.provider';
import { TwilioProvider } from './providers/twilio.provider';
import { EvolutionProvider } from './providers/evolution.provider';
import { WahaProvider } from './providers/waha.provider';
import { normaliserTelephone } from './providers/sms.provider.types';
import type { SmsProvider } from './providers/sms.provider.types';

export interface SmsConfig {
  fournisseur: 'twilio' | 'twilio-whatsapp' | 'evolution' | 'waha' | 'simulation';
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  twilioContentSid?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionInstance?: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
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
    if ((config.fournisseur === 'twilio' || config.fournisseur === 'twilio-whatsapp') && config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber) {
      const mode = config.fournisseur === 'twilio-whatsapp' ? 'whatsapp' : 'sms';
      this.provider = new TwilioProvider(config.twilioAccountSid, config.twilioAuthToken, config.twilioFromNumber, mode, config.twilioContentSid);
      this.logger.info(`SMS: provider Twilio ${mode.toUpperCase()} ACTIF`);
    } else if (config.fournisseur === 'evolution' && config.evolutionApiUrl && config.evolutionApiKey && config.evolutionInstance) {
      this.provider = new EvolutionProvider(config.evolutionApiUrl, config.evolutionApiKey, config.evolutionInstance);
      this.logger.info('WhatsApp: provider Evolution API ACTIF (gratuit, instance ' + config.evolutionInstance + ')');
    } else if (config.fournisseur === 'waha' && config.wahaApiUrl && config.wahaApiKey) {
      this.provider = new WahaProvider(config.wahaApiUrl, config.wahaApiKey, config.wahaSession || 'default');
      this.logger.info('WhatsApp: provider WAHA ACTIF (gratuit, session ' + (config.wahaSession || 'default') + ')');
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

  /** WhatsApp pro à l'équipe quand une mission lui est assignée.
   *  Deadline (date admin) + client + chantier + adresse + lien GPS cliquable + lien appli.
   *  Les champs manquants sont enrichis auto depuis la BDD (chantiers + mission). */
  async notifierNouvelleMission(args: {
    equipeId: string; equipeNom: string; telephone: string | null;
    phase: string; chantierNom: string; adresse?: string | null;
    clientNom?: string | null; dateDebut?: string | null; dateEcheance?: string | null;
    latitude?: number | null; longitude?: number | null;
    lienAppli?: string | null;
    chantierId: string; missionId: string;
  }): Promise<void> {
    // ── Enrichissement auto depuis BDD (si l'appelant n'a passé que chantierId) ──
    let clientNom = args.clientNom ?? null;
    let adresse = args.adresse ?? null;
    let dateDebut = args.dateDebut ?? null;
    let dateEcheance = args.dateEcheance ?? null;
    let latitude = args.latitude ?? null;
    let longitude = args.longitude ?? null;
    try {
      if (!clientNom || !adresse || !dateDebut || !dateEcheance || latitude == null || longitude == null) {
        const { rows } = await this.pool.query(
          `SELECT c.client_nom, c.adresse, c.date_echeance,
                  c.date_debut_mecanique, c.date_debut_electrique, c.date_debut_verification,
                  ST_Y(c.coordonnees::geometry) AS lat, ST_X(c.coordonnees::geometry) AS lng,
                  om.date_declenchement AS mission_debut, om.date_echeance AS mission_fin
           FROM chantiers c LEFT JOIN ordres_de_mission om ON om.id = $2
           WHERE c.id = $1 LIMIT 1`,
          [args.chantierId, args.missionId]
        );
        const r = rows[0];
        if (r) {
          if (!clientNom) clientNom = r.client_nom || null;
          if (!adresse) adresse = r.adresse || null;
          if (latitude == null && r.lat != null) latitude = Number(r.lat);
          if (longitude == null && r.lng != null) longitude = Number(r.lng);
          if (!dateEcheance) dateEcheance = r.mission_fin || r.date_echeance || null;
          if (!dateDebut) {
            const ph = (args.phase || '').toLowerCase();
            dateDebut = (ph.startsWith('elec') ? r.date_debut_electrique
              : ph.startsWith('verif') ? r.date_debut_verification
              : r.date_debut_mecanique) || r.mission_debut || null;
          }
        }
      }
    } catch { /* enrichissement non bloquant */ }
    const baseAppli = (process.env.PUBLIC_APP_URL || 'https://onsite.sarl-rmasc.com').replace(/\/$/, '');
    const lienAppli = args.lienAppli || `${baseAppli}/mission/active`;
    const fmtDate = (iso: string | null | undefined): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const lignes: string[] = [];
    lignes.push(`🛗 *RMASC — NOUVELLE MISSION ${args.phase.toUpperCase()}*`);
    lignes.push(`👷 Équipe : ${args.equipeNom}`);
    lignes.push('');
    const debut = fmtDate(dateDebut);
    const fin = fmtDate(dateEcheance);
    if (debut && fin) lignes.push(`📅 Démarrage : ${debut} → Échéance : ${fin}`);
    else if (debut) lignes.push(`📅 Démarrage : ${debut}`);
    else if (fin) lignes.push(`📅 Échéance : ${fin}`);
    if (clientNom) lignes.push(`🤝 Client : ${clientNom}`);
    lignes.push(`🏗️ Chantier : ${args.chantierNom}`);
    lignes.push(`📍 Adresse : ${adresse || 'à confirmer sur place'}`);
    if (latitude != null && longitude != null
        && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
      const lat = Number(latitude), lng = Number(longitude);
      lignes.push(`🗺️ Position : https://www.google.com/maps?q=${lat},${lng}`);
      lignes.push(`(cliquez pour ouvrir dans Maps et naviguer)`);
    }
    lignes.push('');
    lignes.push(`📱 Votre ordre de mission : ${lienAppli}`);
    lignes.push(`— El Ghani, RMASC`);
    await this.programmer({
      telephone: args.telephone,
      destinataireNom: args.equipeNom,
      contenu: lignes.join('\n'),
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
