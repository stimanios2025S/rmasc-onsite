import type { EnvoiSmsResultat, SmsProvider } from './sms.provider.types';

/**
 * Provider Evolution API — WhatsApp gratuit via votre propre numéro.
 * - 100% gratuit : aucun coût par message (votre puce + votre serveur Evolution)
 * - Texte libre : pas de template imposé (hors fenêtre 24h OK à petit volume)
 * - Petit volume (∼3/jour) : risque de ban quasi nul si numéro dédié pro
 *
 * Prérequis côté Evolution (à installer une fois, voir .env) :
 *   EVOLUTION_API_URL=https://evolution.votre-domaine.com
 *   EVOLUTION_API_KEY=votre_global_apikey
 *   EVOLUTION_INSTANCE=rmasc-onsite   (instance connectée via QR une fois)
 */
export class EvolutionProvider implements SmsProvider {
  readonly nom = 'evolution-whatsapp';

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly instance: string,
  ) {}

  async envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat> {
    // Evolution attend le numéro sans "+" : 213XXXXXXXXX@s.whatsapp.net
    const digits = telephone.replace(/\D/g, '');
    if (digits.length < 9) {
      return { ok: false, fournisseur: this.nom, erreur: 'Numéro invalide pour WhatsApp' };
    }
    const url = `${this.apiUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(this.instance)}`;
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { apikey: this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: digits,
          text: contenu.slice(0, 4000),
          delay: 1200, // petite pause anti-spam
        }),
      });
      if (!reponse.ok) {
        const texte = await reponse.text().catch(() => '');
        return { ok: false, fournisseur: this.nom, erreur: `Evolution HTTP ${reponse.status}: ${texte.slice(0, 300)}` };
      }
      const data = (await reponse.json().catch(() => ({}))) as { key?: { id?: string } };
      return { ok: true, fournisseur: this.nom, messageId: data?.key?.id };
    } catch (err: any) {
      return { ok: false, fournisseur: this.nom, erreur: `Evolution injoignable: ${err.message}` };
    }
  }
}
