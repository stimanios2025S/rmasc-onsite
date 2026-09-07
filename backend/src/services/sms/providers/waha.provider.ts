import type { EnvoiSmsResultat, SmsProvider } from './sms.provider.types';

/**
 * Provider WAHA — WhatsApp gratuit via votre propre numéro.
 * - 100% gratuit : votre puce + votre serveur WAHA (Docker)
 * - Texte libre : pas de template imposé à petit volume
 * - API : POST {apiUrl}/api/sendText {chatId, text, session} + header X-Api-Key
 */
export class WahaProvider implements SmsProvider {
  readonly nom = 'waha-whatsapp';

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly session = 'default',
  ) {}

  async envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat> {
    const digits = telephone.replace(/\D/g, '');
    if (digits.length < 9) {
      return { ok: false, fournisseur: this.nom, erreur: 'Numéro invalide pour WhatsApp' };
    }
    const url = `${this.apiUrl.replace(/\/$/, '')}/api/sendText`;
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: `${digits}@c.us`,
          text: contenu.slice(0, 4000),
          session: this.session,
        }),
      });
      if (!reponse.ok) {
        const texte = await reponse.text().catch(() => '');
        return { ok: false, fournisseur: this.nom, erreur: `WAHA HTTP ${reponse.status}: ${texte.slice(0, 300)}` };
      }
      const data = (await reponse.json().catch(() => ({}))) as { id?: string };
      return { ok: true, fournisseur: this.nom, messageId: data?.id };
    } catch (err: any) {
      return { ok: false, fournisseur: this.nom, erreur: `WAHA injoignable: ${err.message}` };
    }
  }
}
