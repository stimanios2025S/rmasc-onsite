import { Pool } from 'pg';
import { ErreurMetier } from '../../errors/erreur-metier';
import { distanceHaversine, validerCoordonnees } from '../geocalcul/calculs-geo';
import type { IMissionRepository, IChantierRepository, ITechnicienRepository, IPointageRepository } from '../../repositories/interfaces';
import type { OrdreMission, EntreePointageGPS } from '../../types/mission.types';
import { NotificationService } from '../notifications/notification.service';
import { LoggerService } from '../notifications/logger.service';

export interface ResultatPointage { succes: boolean; message: string; mission?: OrdreMission; pointage?: EntreePointageGPS; distanceMetres?: number; estDansRayon: boolean; }
export interface AlertePerimetre { declenchee: boolean; message?: string; distanceMetres?: number; seuilMetres?: number; }

export class PointageService {
  constructor(
    private readonly db: Pool,
    private readonly missionRepo: IMissionRepository,
    private readonly chantierRepo: IChantierRepository,
    private readonly technicienRepo: ITechnicienRepository,
    private readonly pointageRepo: IPointageRepository,
    private readonly notifier: NotificationService,
    private readonly logger: LoggerService
  ) {}

  async validerPointageChantier(technicienId: string, chantierId: string, userLat: number, userLng: number): Promise<ResultatPointage> {
    validerCoordonnees(userLat, userLng);
    const technicien = await this.technicienRepo.trouverParId(technicienId);
    if (!technicien || !technicien.actif) throw ErreurMetier.technicienIntrouvable(technicienId);
    const chantier = await this.chantierRepo.trouverParId(chantierId);
    if (!chantier) throw ErreurMetier.chantierIntrouvable(chantierId);
    const distanceM = await this.calculerDistance(chantier.referenceERP, chantier.coordonnees.latitude, chantier.coordonnees.longitude, userLat, userLng);
    const rayon = chantier.rayonGeofencing ?? 50;
    if (distanceM > rayon) {
      this.logger.warn('Pointage refuse', { technicienId, chantier: chantier.nom, distanceM: Math.round(distanceM), rayon });
      await this.notifier.emettreTableauBord('pointage:refuse', { technicienId, chantierId, chantierNom: chantier.nom, distanceM: Math.round(distanceM), rayon });
      return { succes: false, message: `Acces refuse : vous devez etre a moins de ${rayon}m du chantier. Distance : ${Math.round(distanceM)}m.`, distanceMetres: Math.round(distanceM), estDansRayon: false };
    }
    const mission = await this.missionRepo.trouverEnCoursParEquipe(technicien.equipeId);
    if (!mission || mission.chantierId !== chantierId) return { succes: false, message: 'Aucune mission en attente pour votre equipe sur ce chantier.', estDansRayon: true, distanceMetres: Math.round(distanceM) };
    if (mission.statut !== 'en_attente') return { succes: false, message: 'Mission deja en cours ou terminee.', estDansRayon: true };
    await this.missionRepo.mettreAJourStatut(mission.id, 'en_cours');
    await this.missionRepo.mettreAJourDates(mission.id, new Date(), null);
    const missionMAJ = await this.missionRepo.trouverParId(mission.id) as OrdreMission;
    const pointage = await this.pointageRepo.enregistrer({
      ordreMissionId: mission.id, technicienId, type: 'arrivee',
      coordonnees: { latitude: userLat, longitude: userLng },
      distanceChantierM: Math.round(distanceM * 10) / 10, dansRayon: true,
    });
    await this.notifier.emettreTableauBord('pointage:valide', { missionId: mission.id, technicienId, chantierId, chantierNom: chantier.nom, phase: mission.phase, distanceM: Math.round(distanceM) });
    this.logger.info('Pointage valide', { missionId: mission.id, chantier: chantier.nom, distanceM: Math.round(distanceM) });
    return { succes: true, message: `Pointage valide. Distance : ${Math.round(distanceM)}m.`, mission: missionMAJ, pointage, distanceMetres: Math.round(distanceM), estDansRayon: true };
  }

  async surveillerPerimetre(missionId: string, currentLat: number, currentLng: number): Promise<AlertePerimetre> {
    validerCoordonnees(currentLat, currentLng);
    const mission = await this.missionRepo.trouverParId(missionId);
    if (!mission) throw ErreurMetier.missionIntrouvable(missionId);
    if (mission.statut !== 'en_cours') return { declenchee: false };
    const chantier = await this.chantierRepo.trouverParId(mission.chantierId);
    if (!chantier) throw ErreurMetier.chantierIntrouvable(mission.chantierId);
    const distanceM = await this.calculerDistance(chantier.referenceERP, chantier.coordonnees.latitude, chantier.coordonnees.longitude, currentLat, currentLng);
    const rayon = chantier.rayonGeofencing ?? 50;
    if (distanceM <= rayon) return { declenchee: false, distanceMetres: Math.round(distanceM) };
    this.logger.warn('Perimetre quitte', { missionId, distanceM: Math.round(distanceM), seuil: rayon });
    await this.notifier.envoyerPush({
      titre: 'Alerte perimetre', corps: `Alerte : Vous vous etes eloigne du chantier "${chantier.nom}". Distance : ${Math.round(distanceM)}m (limite: ${rayon}m).`,
      destinataires: [], donnees: { type: 'geofencing:alerte', missionId, chantierId: chantier.id, distanceMetres: Math.round(distanceM), seuilMetres: rayon },
    });
    await this.notifier.alerterDispatcher({
      type: 'geofencing:perimetre', titre: 'Technicien hors perimetre',
      message: `${Math.round(distanceM)}m du chantier "${chantier.nom}" (limite ${rayon}m).`,
      missionId, chantierId: chantier.id, priorite: 'haute',
      donneesComplement: { distanceM: Math.round(distanceM), seuil: rayon },
    });
    return { declenchee: true, message: `Alerte : vous etes a ${Math.round(distanceM)}m du chantier (limite: ${rayon}m).`, distanceMetres: Math.round(distanceM), seuilMetres: rayon };
  }

  async enregistrerDepart(technicienId: string, missionId: string, userLat: number, userLng: number): Promise<ResultatPointage> {
    const mission = await this.missionRepo.trouverParId(missionId);
    if (!mission || mission.statut !== 'en_cours') return { succes: false, message: 'Aucune mission en cours a terminer.', estDansRayon: false };
    const chantier = await this.chantierRepo.trouverParId(mission.chantierId);
    if (!chantier) throw ErreurMetier.chantierIntrouvable(mission.chantierId);
    const distanceM = await this.calculerDistance(chantier.referenceERP, chantier.coordonnees.latitude, chantier.coordonnees.longitude, userLat, userLng);
    const pointage = await this.pointageRepo.enregistrer({
      ordreMissionId: missionId, technicienId, type: 'depart',
      coordonnees: { latitude: userLat, longitude: userLng },
      distanceChantierM: Math.round(distanceM * 10) / 10, dansRayon: distanceM <= (chantier.rayonGeofencing ?? 50),
    });
    await this.missionRepo.mettreAJourStatut(missionId, 'termine');
    await this.missionRepo.mettreAJourDates(missionId, mission.dateDebutEffectif, new Date());
    const missionMAJ = await this.missionRepo.trouverParId(missionId) as OrdreMission;
    this.logger.info('Mission terminee', { missionId });
    return { succes: true, message: 'Mission terminee. Bon retour !', mission: missionMAJ, pointage, distanceMetres: Math.round(distanceM), estDansRayon: true };
  }

  private async calculerDistance(refERP: string, cLat: number, cLng: number, uLat: number, uLng: number): Promise<number> {
    try {
      const { rows } = await this.db.query(
        `SELECT ST_Distance(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, true) AS distance`,
        [uLng, uLat, cLng, cLat]);
      const d = parseFloat(rows[0]?.distance);
      if (!isNaN(d)) return d;
      throw new Error('PostGIS NULL');
    } catch (err) {
      this.logger.warn('Fallback Haversine', { refERP });
      return distanceHaversine(uLat, uLng, cLat, cLng);
    }
  }
}
