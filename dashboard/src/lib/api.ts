import { apiFetch } from './auth';

// NOTE: apiFetch() already prefixes /api — DON'T include /api in path

export interface ChantierData {
  id: string; ref: string; nom: string; statut: string; client_nom: string;
  lat: number; lng: number; missions: number; en_cours: number; date_creation: string;
  complexite?: string; dxf?: string | null; pdf?: string | null;
  en_attente?: number; bloquee?: number; terminee?: number;
  equipe_actuelle?: string; phase_actuelle?: string;
}
export interface DemandeData {
  id: string; ref: string; client_nom: string; nom_chantier: string; statut: string; cree: string;
}
export interface EquipeData {
  id: string; nom: string; type: string; statut_equipe: string; dispo: string; missions: number; jours_repos_restants: number;
}
export interface StatsData {
  chantiersActifs: number; chantiersBloques: number; chantiersTotal: number;
  missionsEnCours: number; missionsTotal: number; demandesEnAttente: number;
  blocagesOuverts: number; blocagesTotal: number; equipesDisponibles: number;
}
export interface IncidentData {
  type: string; priorite: string; message: string; nom_chantier: string; moment: string;
}

export async function fetchChantiers(): Promise<ChantierData[]> {
  return apiFetch('/chantiers');
}

export async function fetchDemandes(): Promise<DemandeData[]> {
  return apiFetch('/admin/demandes');
}

export async function fetchEquipes(): Promise<EquipeData[]> {
  return apiFetch('/admin/equipes');
}

export async function fetchStats(): Promise<StatsData> {
  return apiFetch('/admin/stats');
}

export async function fetchIncidents(): Promise<IncidentData[]> {
  return apiFetch('/admin/incidents');
}

export interface EquipementEquipe {
  id: string; nom: string; categorie: string; quantite: number; etat: string; date_assignation: string;
}

export interface EquipementChantier {
  id: string; nom: string; quantite: number; fourni_par: string; verifie: boolean;
}

export async function fetchEquipementsEquipe(equipeId: string): Promise<EquipementEquipe[]> {
  return apiFetch(`/equipe/${equipeId}/equipements`);
}

export async function fetchEquipementsChantier(equipeId: string, chantierId: string): Promise<EquipementChantier[]> {
  return apiFetch(`/equipe/${equipeId}/equipements_chantier?chantier_id=${chantierId}`);
}

export async function verifierEquipement(equipeId: string, eqId: string) {
  return apiFetch(`/equipe/${equipeId}/equipements_chantier/${eqId}`, { method: 'PATCH' });
}

export async function approuverDemande(id: string) {
  return apiFetch(`/admin/demandes/${id}/approuver`, { method: 'POST' });
}

export async function refuserDemande(id: string) {
  return apiFetch(`/admin/demandes/${id}/refuser`, { method: 'POST' });
}

export interface NouveauChantier {
  nom: string;
  client_nom?: string;
  adresse?: string;
  latitude: number;
  longitude: number;
  rayon_geofencing?: number;
  complexite?: string;
  reference_commande_erp?: string;
  dxfUrl?: string;
  pdfUrl?: string;
  ficheTechnique?: string;
}

export interface CreerChantierResult {
  chantierId: string;
  missionId: string | null;
  equipeNom: string | null;
  message: string;
}

export async function creerChantier(data: NouveauChantier): Promise<CreerChantierResult> {
  return apiFetch('/chantiers', { method: 'POST', body: JSON.stringify(data) });
}

export async function modifierChantier(id: string, data: Partial<NouveauChantier>) {
  return apiFetch(`/chantiers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function supprimerChantier(id: string) {
  return apiFetch(`/chantiers/${id}`, { method: 'DELETE' });
}

// ─── SMS automatiques ────────────────────────────────────────────────

export interface SmsLogData {
  id: string; telephone: string; destinataire_nom: string | null; contenu: string;
  type_evenement: string; statut: string; tentative: number; fournisseur: string | null;
  erreur: string | null; nom_chantier: string | null; equipe_nom: string | null;
  cree: string; envoye: string | null;
}

export interface TelephoneData {
  equipe_id: string; equipe_nom: string; type: string;
  utilisateur_id: string | null; prenom: string | null; nom: string | null;
  telephone: string | null; role: string; actif: boolean;
}

export async function fetchSmsLog(): Promise<{ fournisseur: string; sms: SmsLogData[] }> {
  return apiFetch('/admin/sms');
}

export async function fetchTelephones(): Promise<TelephoneData[]> {
  return apiFetch('/admin/telephones');
}

export async function sauvegarderTelephones(lignes: { utilisateur_id: string; telephone: string | null }[]) {
  return apiFetch('/admin/telephones', { method: 'PUT', body: JSON.stringify({ lignes }) });
}
