import { apiFetch } from './auth';

// NOTE: apiFetch() already prefixes /api — DON'T include /api in path

export interface ChecklistEtape {
  label: string;
  done: boolean;
  subtasks?: { label: string; done: boolean }[];
}

export interface ChantierData {
  id: string; ref: string; nom: string; statut: string; client_nom: string;
  lat?: number | null; lng?: number | null; missions: number; en_cours: number; date_creation: string;
  complexite?: string; dxf?: string | null; pdf?: string | null;
  en_attente?: number; bloquee?: number; terminee?: number;
  equipe_actuelle?: string; phase_actuelle?: string; mission_statut?: string; adresse?: string;
  checklist_etapes?: ChecklistEtape[] | string | null;
  checklist_complete?: boolean | null;
  date_echeance?: string | null;
  mission_id?: string | null;
  motifs_blocage?: string | null;
  nb_blocages?: number;
  blocage_ids?: string | null;
}
export interface DemandeData {
  id: string; ref: string; client_nom: string; nom_chantier: string; statut: string; cree: string;
}
export interface EquipeData {
  id: string; nom: string; type: string; statut_equipe: string; dispo: string; missions: number; jours_repos_restants: number;
  membres_noms?: string;
  pointage_matinal?: string | null;
  pointage_fin_journee?: string | null;
  jours_repos?: number | null;
}
export interface StatsData {
  chantiersActifs: number; chantiersBloques: number; chantiersTotal: number;
  missionsEnCours: number; missionsTotal: number; demandesEnAttente: number;
  blocagesOuverts: number; blocagesTotal: number; equipesDisponibles: number;
}
export interface IncidentData {
  type: string; priorite: string; message: string; nom_chantier: string; moment: string; equipe_nom?: string;
  photo_url?: string | null; mission_id?: string | null; blocage_id?: string | null;
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
  date_echeance?: string;
  forceEquipeId?: string;
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

// ─── RÉASSIGNATION D'ÉQUIPE ──────────────────────────────────────────
export async function reassignerEquipe(chantierId: string, equipeId: string): Promise<{ message?: string }> {
  return apiFetch(`/admin/chantiers/${chantierId}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify({ equipe_id: equipeId }),
  });
}

// ─── CANCEL BLOCAGE ───────────────────────────────────────────────
export async function annulerBlocage(blocageId: string, motif?: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/mission/blocage/${blocageId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ motif: motif || 'Annulé par admin' }),
  });
}

// ─── DEMANDES MATÉRIEL / SIGNALEMENTS ──────────────────────────────
export interface DemandeMateriel {
  id: string; items: any[]; description: string | null; photo_url: string | null;
  type_demande: 'materiel' | 'retard'; statut: string; pdf_url: string | null;
  date_creation: string; equipe_nom: string; equipe_type: string;
  chantier_nom: string; chantier_ref: string | null;
}

export async function fetchDemandesMateriel(type?: string, statut?: string): Promise<DemandeMateriel[]> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (statut) params.set('statut', statut);
  const q = params.toString();
  return apiFetch(`/materiel${q ? '?' + q : ''}`);
}

export async function modifierStatutDemande(id: string, statut: string) {
  return apiFetch(`/materiel/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut }),
  });
}

// ─── WORKER: Demande matériel ─────────────────────────────────────
export async function soumettreDemandeMateriel(data: {
  equipeId: string; chantierId: string; missionId?: string;
  items: { nom: string; quantite: number; categorie: string }[];
  description?: string; photoUrl?: string;
}): Promise<{ id: string; message: string; pdfUrl: string }> {
  return apiFetch('/materiel/demande', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── WORKER: Signaler problème ────────────────────────────────────
export async function signalerProbleme(data: {
  equipeId: string; chantierId: string; missionId?: string;
  description: string; photoUrl?: string; motif?: string;
}): Promise<{ id: string; message: string; pdfUrl: string }> {
  return apiFetch('/materiel/signaler', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── TEAM MANAGEMENT (Admin) ───────────────────────────────────────────
export interface TeamMember {
  id: string; equipe_id: string; prenom: string; nom: string;
  role: string; telephone: string | null; actif: boolean;
}
export interface TeamData {
  id: string; nom: string; type: string; couleur_hex: string | null;
  actif: boolean; statut_equipe: string; disponible_a_partir_de: string;
  date_creation: string; missions_actives: number; jours_repos_restants: number;
  jours_repos: number | null;
  membres: TeamMember[];
}
export interface MissionReassign {
  id: string; phase: string; statut: string;
  nom_chantier: string; ref_erp: string;
  equipe_nom: string | null; equipe_id: string | null; equipe_type: string | null;
  checklist_complete: boolean | null;
  date_declenchement: string; date_debut_effectif: string | null;
}
export interface SystemConfig {
  [cle: string]: { valeur: string; description: string };
}

export async function fetchTeamsManagement(): Promise<TeamData[]> {
  return apiFetch('/admin/teams');
}
export async function createTeam(data: {
  nom: string; type: string; couleur_hex?: string; jours_repos?: number | null;
  membres?: { prenom: string; nom: string; telephone?: string; role?: string }[];
}): Promise<{ ok: boolean; equipe: TeamData; membres?: any[]; credentials?: { identifiant: string; mot_de_passe: string }[]; message: string }> {
  return apiFetch(`/admin/teams`, { method: 'POST', body: JSON.stringify(data) });
}
export async function updateTeam(id: string, data: { nom?: string; type?: string; couleur_hex?: string; actif?: boolean; jours_repos?: number | null }) {
  return apiFetch(`/admin/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}
export async function updateTeamMembers(id: string, membres: { id: string; prenom: string; nom: string; telephone?: string | null }[]) {
  return apiFetch(`/admin/teams/${id}/members`, { method: 'PUT', body: JSON.stringify({ membres }) });
}
export async function manageRepos(equipeId: string, action: 'annuler' | 'prolonger' | 'definir' | 'configurer', params?: { jours?: number; date_fin?: string }): Promise<{ ok: boolean; message?: string }> {
  return apiFetch<{ ok: boolean; message?: string }>(`/admin/teams/${equipeId}/repos`, {
    method: 'PATCH',
    body: JSON.stringify({ action, ...params }),
  });
}
export async function fetchSystemConfig(): Promise<SystemConfig> {
  return apiFetch('/admin/teams/config');
}
export async function updateSystemConfig(parametres: Record<string, string>) {
  return apiFetch('/admin/teams/config', { method: 'PATCH', body: JSON.stringify({ parametres }) });
}
export async function fetchMissionsReassign(): Promise<MissionReassign[]> {
  return apiFetch('/admin/teams/missions');
}
export async function reassignMission(missionId: string, equipeId: string) {
  return apiFetch<{ ok: boolean; message: string }>(`/admin/teams/missions/${missionId}/reassign`, {
    method: 'PATCH', body: JSON.stringify({ equipe_id: equipeId }),
  });
}

// ─── TIMESHEET (Admin daily timeline) ───────────────────────────────
export interface TimesheetEvent {
  type: string; heure: string; horodatage: string;
  chantier?: string | null; technicien?: string;
  conforme?: boolean; distance?: number; icon: string; label: string;
  heure_fin?: string | null; duree_minutes?: number | null;
  motif?: string | null; en_cours?: boolean;
}
export interface TimesheetEquipe {
  equipe_id: string; equipe_nom: string; equipe_type: string;
  events: TimesheetEvent[];
  stats: { matinal: string | null; fin_journee: string | null; arrivee: string | null; totalPausedMinutes: number; isPaused: boolean; chantier_nom: string | null };
}
export interface TimesheetData {
  date: string; equipes: TimesheetEquipe[];
}
export async function fetchTimesheet(date?: string): Promise<TimesheetData> {
  const q = date ? `?date=${date}` : '';
  return apiFetch(`/admin/teams/timesheet${q}`);
}

// ═══ CHANTIER SEARCH — Recherche intelligente ═══════════════════════════
export interface ChantierSearchBlocage {
  id: string; ordre_mission_id: string; raison_blocage: string; priorite: string;
  statut: string; date_creation: string; date_resolution: string | null;
  step_id: string | null; motif_retard: string | null; photo_proof_url: string | null;
}
export interface ChantierSearchRetard {
  id: string; chantier_id: string; mission_id: string; equipe_id: string;
  motif: string; date_creation: string; lue: boolean; photo_url: string | null;
  equipe_nom: string | null;
}
export interface ChantierSearchMission {
  id: string; chantier_id: string; phase: string; statut: string;
  date_creation: string; date_declenchement: string | null;
  date_debut_effectif: string | null; date_fin_effectif: string | null;
  duree_estimee_jours: number | null;
  equipe_nom: string | null; equipe_type: string | null;
}
export interface ChantierSearchPointage {
  equipe_id: string; type_pointage: string; horodatage: string;
  dans_rayon: boolean; distance_chantier_m: number | null;
  equipe_nom: string; chantier_id: string;
}
export interface ChantierSearchResult {
  id: string; nom_chantier: string; reference_commande_erp: string | null;
  adresse: string | null; client_nom: string | null; client_telephone: string | null;
  statut: string; date_echeance: string | null; complexe: string | null;
  latitude: number | null; longitude: number | null; rayon_geofencing: number | null;
  missions: ChantierSearchMission[];
  blocages: ChantierSearchBlocage[];
  retards: ChantierSearchRetard[];
  pointages: ChantierSearchPointage[];
  stats: {
    totalMissions: number; missionsTerminees: number; missionsEnCours: number;
    blocagesOuverts: number; blocagesTotal: number;
    retardsTotal: number; retardsNonLus: number;
    totalPointages: number; pointagesConformes: number;
  };
}
export async function searchChantiers(q: string): Promise<{ results: ChantierSearchResult[] }> {
  return apiFetch(`/admin/teams/chantier-search?q=${encodeURIComponent(q)}`);
}
