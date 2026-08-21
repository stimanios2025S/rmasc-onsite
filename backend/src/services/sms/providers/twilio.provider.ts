import type { EnvoiSmsResultat, SmsProvider } from './sms.provider.types';

/**
 * Provider Twilio — envoi réel de SMS via l'API REST Twilio.
 * Aucune dépendance externe : utilise fetch natif (Node 18+).
 */
export class TwilioProvider implements SmsProvider {
  readonly nom = 'twilio';

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: telephone,
      From: this.fromNumber,
      Body: contenu.slice(0, 1600),
    });

    const reponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      return { ok: false, fournisseur: this.nom, erreur: `Twilio HTTP ${reponse.status}: ${texte.slice(0, 300)}` };
    }

    const data = await reponse.json().catch(() => ({})) as { sid?: string };
    return { ok: true, fournisseur: this.nom, messageId: data.sid };
  }
}
