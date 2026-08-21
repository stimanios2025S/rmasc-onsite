import { Pool } from 'pg';
import { LoggerService } from '../notifications/logger.service';
import { normaliserTelephone } from './providers/sms.provider.types';
import type { SmsService } from './sms.service';

const INTERVALLE_MS = 30_000; // traitement toutes les 30s
const MAX_TENTATIVES = 3;

/**
 * SmsWorker — parcourt sms_outbox et envoie les SMS en attente via le provider.
 * - Succès      → statut ENVOYE + date_envoi
 * - Échec       → tentative+1 ; après MAX_TENTATIVES → statut ECHEC
 * - Backoff     → prochaine_tentative = NOW() + tentative * 60s
 */
export class SmsWorker {
  private timer: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly pool: Pool,
    private readonly smsService: SmsService,
    private readonly logger: LoggerService
  ) {}

  demarrer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.traiter(); }, INTERVALLE_MS);
    // Traitement immédiat au démarrage
    void this.traiter();
    this.logger.info(`SMS Worker démarré (intervalle ${INTERVALLE_MS / 1000}s, fournisseur ${this.smsService.provider.nom})`);
  }

  arreter(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async traiter(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      const { rows } = await this.pool.query(
        `SELECT id, telephone, contenu, tentative
         FROM sms_outbox
         WHERE statut = 'EN_ATTENTE' AND prochaine_tentative <= NOW()
         ORDER BY date_creation LIMIT 20`
      );
      for (const sms of rows) {
        await this.envoyerUn(sms);
      }
    } catch (err: any) {
      this.logger.error('SMS Worker: erreur', { erreur: err.message });
    } finally {
      this.enCours = false;
    }
  }

  private async envoyerUn(sms: any): Promise<void> {
    const tel = normaliserTelephone(sms.telephone);
    if (!tel) {
      await this.pool.query(
        `UPDATE sms_outbox SET statut = 'ECHEC', erreur = 'Numéro invalide', fournisseur = $2
         WHERE id = $1`,
        [sms.id, this.smsService.provider.nom]
      );
      this.logger.warn('SMS ignoré — numéro invalide', { id: sms.id, tel: sms.telephone });
      return;
    }
    try {
      const resultat = await this.smsService.provider.envoyer(tel, sms.contenu);
      if (resultat.ok) {
        await this.pool.query(
          `UPDATE sms_outbox SET statut = 'ENVOYE', date_envoi = NOW(), fournisseur = $2, tentative = tentative + 1
           WHERE id = $1`,
          [sms.id, resultat.fournisseur]
        );
        this.logger.info(`SMS envoyé (${resultat.fournisseur})`, { id: sms.id, tel });
      } else {
        await this.echec(sms, resultat.erreur || 'Échec inconnu');
      }
    } catch (err: any) {
      await this.echec(sms, err.message);
    }
  }

  private async echec(sms: any, erreur: string): Promise<void> {
    const tentative = sms.tentative + 1;
    if (tentative >= MAX_TENTATIVES) {
      await this.pool.query(
        `UPDATE sms_outbox SET statut = 'ECHEC', tentative = $2, erreur = $3, fournisseur = $4
         WHERE id = $1`,
        [sms.id, tentative, erreur.slice(0, 300), this.smsService.provider.nom]
      );
      this.logger.error('SMS en échec définitif', { id: sms.id, tel: sms.telephone, erreur });
    } else {
      await this.pool.query(
        `UPDATE sms_outbox SET tentative = $2, erreur = $3, fournisseur = $4,
                prochaine_tentative = NOW() + ($2 * INTERVAL '60 seconds')
         WHERE id = $1`,
        [sms.id, tentative, erreur.slice(0, 300), this.smsService.provider.nom]
      );
      this.logger.warn(`SMS échec (tentative ${tentative}/${MAX_TENTATIVES})`, { id: sms.id, tel: sms.telephone, erreur });
    }
  }
}
