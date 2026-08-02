import { apiFetch } from './auth';

// NOTE: apiFetch() already prefixes /api — DON'T include /api in path

export interface ChantierData {
  id: string; ref: string; nom: string; statut: string; client_nom: string;
  lat: number; lng: number; missions: number; en_cours: number; date_creation: string;
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
