export type Phase = 'mecanique' | 'electrique' | 'verification';
export type StatutMission = 'en_attente' | 'en_cours' | 'bloque' | 'termine';
export type StatutChantier = 'planifie' | 'en_cours' | 'suspendu' | 'termine' | 'reception_officielle';
export type PrioriteBlocage = 'basse' | 'moyenne' | 'haute' | 'critique';
export type StatutBlocage = 'ouvert' | 'en_cours' | 'resolu';

export interface CoordonneesGPS { latitude: number; longitude: number; }

export interface Technicien {
  id: string; prenom: string; nom: string; email: string;
  equipeId: string; actif: boolean; telephone?: string;
}

export interface Equipe {
  id: string; nom: string; type: Phase; actif: boolean;
}

export interface Chantier {
  id: string; referenceERP: string; nom: string;
  coordonnees: CoordonneesGPS; rayonGeofencing: number; statut: StatutChantier;
}

export interface OrdreMission {
  id: string; chantierId: string; equipeId: string; phase: Phase;
  statut: StatutMission; priorite: PrioriteBlocage;
  dateDeclenchement: Date | null; dateDebutEffectif: Date | null; dateFinEffectif: Date | null;
}

export interface EntreePointageGPS {
  id: string; ordreMissionId: string; technicienId: string;
  type: 'arrivee' | 'depart'; horodatage: Date;
  coordonnees: CoordonneesGPS; distanceChantierM: number | null; dansRayon: boolean;
}

export interface Blocage {
  id: string; ordreMissionId: string; declarePar: string;
  raisonBlocage: string; idPieceERP: string | null;
  priorite: PrioriteBlocage; urlsPhotos: string[];
  statut: StatutBlocage; dateCreation: Date;
}
