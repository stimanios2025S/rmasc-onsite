export type CategorieEvenement =
  | 'phase:terminee' | 'phase:demarree' | 'phase:bloquee'
  | 'blocage:cree' | 'blocage:resolu'
  | 'chantier:receptionne' | 'geofencing:alerte'
  | 'pointage:valide' | 'pointage:refuse';

export interface EvenementMetier {
  id: string; categorie: CategorieEvenement; source: string;
  horodatage: Date; donnees: Record<string, unknown>;
}

export interface NotificationPush {
  titre: string; corps: string; destinataires: string[];
  donnees?: Record<string, unknown>;
}

export interface WebhookERP {
  evenement: string; referenceERP: string;
  payload: Record<string, unknown>; dateEnvoi: Date;
}
