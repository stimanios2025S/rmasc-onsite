export type PhaseChantier = 'mecanique' | 'electrique' | 'verification';
export type StatutChantier = 'planifie' | 'en_cours' | 'bloque' | 'termine' | 'reception_officielle';
export type PrioriteBlocage = 'basse' | 'moyenne' | 'haute' | 'critique';

export interface Chantier {
  id: string; referenceERP: string; nom: string; adresse: string;
  coordonnees: { lat: number; lng: number };
  phase: PhaseChantier; statut: StatutChantier;
  equipeId: string; equipeNom: string; techniciens: string[];
  rayonGeofencing: number;
  dernierPointageDistance: number | null;
  dernierPointageHorodatage: string | null;
  dateCreation: string;
}

export interface Equipe {
  id: string; nom: string; type: string;
  membresActifs: number; membresTotal: number;
  chargeActuelle: number; dureeMoyenneIntervention: number;
}

export interface Alerte {
  id: string; type: 'blocage' | 'perimetre' | 'requisition' | 'phase';
  priorite: PrioriteBlocage;
  chantierId: string; chantierNom: string;
  message: string; detail: string;
  horodatage: string; lue: boolean;
  pieceERP?: string; photoUrl?: string;
}

export interface PointageRecent {
  id: string; technicienNom: string;
  type: 'arrivee' | 'depart';
  distanceM: number; horodatage: string; conforme: boolean;
}

export interface PerformanceEquipe {
  equipeNom: string; equipeType: string;
  dureeMoyenneMecanique: number;
  dureeMoyenneElectrique: number;
  dureeMoyenneVerification: number;
  nbMissionsTerminees: number;
}

export interface CauseRetard {
  cause: string; pourcentage: number; couleur: string;
}

export interface KpiData {
  chantiersActifs: number; chantiersBloques: number;
  equipesDeployees: number; equipesTotal: number;
  alertesPerimetre: number;
  evolutionChantiersActifs: number;
  evolutionChantiersBloques: number;
}
