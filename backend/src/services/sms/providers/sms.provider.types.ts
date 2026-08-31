export interface EnvoiSmsResultat {
  ok: boolean;
  fournisseur: string;
  messageId?: string;
  erreur?: string;
}

export interface SmsProvider {
  readonly nom: string;
  envoyer(telephone: string, contenu: string): Promise<EnvoiSmsResultat>;
}

/** Normalise un numéro algérien vers le format international +213… */
export function normaliserTelephone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.replace(/[\s.\-()]/g, '').trim();
  if (/^\+/.test(t)) return t;
  if (/^00/.test(t)) return '+' + t.slice(2);
  if (/^0[567]/.test(t) && t.length === 10) return '+213' + t.slice(1); // 05/06/07 → +2135/6/7
  if (/^[567]\d{8}$/.test(t)) return '+213' + t; // déjà sans 0
  return '+' + t; // autre format → on tente tel quel
}
