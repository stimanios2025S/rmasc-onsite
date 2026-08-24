import type { EnvoiSmsResultat, SmsProvider } from './sms.provider.types';

/**
 * Provider Twilio — envoi réel de SMS ou WhatsApp via l'API REST Twilio.
 * Mode WhatsApp : utilise Content Templates (requis pour les comptes trial).
 * Utilise fetch natif (Node 18+), aucune dépendance externe.
 */
export class TwilioProvider implements SmsProvider {
  readonly nom: string;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
    private readonly mode: 'sms' | 'whatsapp' = 'sms',
    private readonly contentSid?: string
  ) {
    this.nom = mode === 'whatsapp' ? 'twilio-whatsapp' : 'twilio';
  }

  async envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const to = this.mode === 'whatsapp' ? `whatsapp:${telephone}` : telephone;
    const from = this.mode === 'whatsapp' ? `whatsapp:${this.fromNumber}` : this.fromNumber;

    // Essayer d'abord avec Content Template, puis fallback vers Body
    if (this.mode === 'whatsapp' && this.contentSid) {
      const templateResult = await this.envoyerAvecTemplate(url, to, from, contenu);
      if (templateResult.ok) return templateResult;
      // Si le template échoue (SID invalide), essayer avec Body
      console.log(`[SMS] Template échoué, fallback vers Body: ${templateResult.erreur}`);
    }

    return this.envoyerAvecBody(url, to, from, contenu);
  }

  private async envoyerAvecTemplate(url: string, to: string, from: string, contenu: string): Promise<EnvoiSmsResultat> {
    const params = new URLSearchParams({
      To: to, From: from,
      ContentSid: this.contentSid!,
      ContentVariables: JSON.stringify(this.extraireVariables(contenu)),
    });
    return this.apercuFetch(url, params);
  }

  private async envoyerAvecBody(url: string, to: string, from: string, contenu: string): Promise<EnvoiSmsResultat> {
    const params = new URLSearchParams({
      To: to, From: from,
      Body: contenu.slice(0, 1600),
    });
    return this.apercuFetch(url, params);
  }

  private async apercuFetch(url: string, params: URLSearchParams): Promise<EnvoiSmsResultat> {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      return { ok: false, fournisseur: this.nom, erreur: `Twilio HTTP ${reponse.status}: ${texte.slice(0, 300)}` };
    }

    const data = await reponse.json().catch(() => ({})) as { sid?: string };
    return { ok: true, fournisseur: this.nom, messageId: data.sid };
  }

  /**
   * Extrait les variables du contenu pour le template WhatsApp.
   * Template: 🛗 RMASC: NOUVELLE MISSION {{1}} — "{{2}}" à {{3}}. Équipe {{4}}.
   * Parse le message texte pour remplir les variables.
   */
  private extraireVariables(contenu: string): Record<string, string> {
    // Format attendu: "🛗 RMASC: NOUVELLE MISSION PHASE — "NOM" à ADRESSE. Équipe NOM."
    const match = contenu.match(/NOUVELLE MISSION\s+(\S+)\s+—\s+"([^"]+)"\s+à\s+(.+?)\.\s+Équipe\s+(.+?)\./i);
    if (match) {
      return { '1': match[1], '2': match[2], '3': match[3], '4': match[4] };
    }
    // Fallback: mettre tout dans la variable 1
    return { '1': contenu.slice(0, 100), '2': '', '3': '', '4': '' };
  }
}
