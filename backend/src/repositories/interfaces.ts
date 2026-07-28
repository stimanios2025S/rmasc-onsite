import type { Chantier, OrdreMission, Technicien, Equipe, EntreePointageGPS, Blocage, StatutMission, StatutChantier, StatutBlocage, Phase, CoordonneesGPS } from '../types/mission.types';

export interface IChantierRepository {
  trouverParId(id: string): Promise<Chantier | null>;
  trouverParReferenceERP(ref: string): Promise<Chantier | null>;
  mettreAJourStatut(id: string, statut: StatutChantier): Promise<void>;
}

export interface IMissionRepository {
  trouverParId(id: string): Promise<OrdreMission | null>;
  trouverActiveParChantierEtPhase(chantierId: string, phase: Phase): Promise<OrdreMission | null>;
  trouverEnCoursParEquipe(equipeId: string): Promise<OrdreMission | null>;
  creer(d: { chantierId: string; equipeId: string; phase: Phase; notes?: string }): Promise<OrdreMission>;
  mettreAJourStatut(id: string, statut: StatutMission): Promise<void>;
  mettreAJourDates(id: string, debut: Date | null, fin: Date | null): Promise<void>;
}

export interface IEquipeRepository {
  trouverParId(id: string): Promise<Equipe | null>;
  trouverDisponible(type: Phase): Promise<Equipe | null>;
}

export interface ITechnicienRepository {
  trouverParId(id: string): Promise<Technicien | null>;
  trouverParEquipe(equipeId: string): Promise<Technicien[]>;
}

export interface IPointageRepository {
  enregistrer(d: { ordreMissionId: string; technicienId: string; type: 'arrivee'|'depart'; coordonnees: CoordonneesGPS; distanceChantierM: number; dansRayon: boolean }): Promise<EntreePointageGPS>;
  trouverDernierArrivee(missionId: string, technicienId: string): Promise<EntreePointageGPS | null>;
}

export interface IBlocageRepository {
  creer(d: { ordreMissionId: string; declarePar: string; raisonBlocage: string; idPieceERP: string|null; priorite: string; urlsPhotos: string[] }): Promise<Blocage>;
  trouverActifParMission(missionId: string): Promise<Blocage[]>;
  mettreAJourStatut(id: string, statut: StatutBlocage): Promise<void>;
}
