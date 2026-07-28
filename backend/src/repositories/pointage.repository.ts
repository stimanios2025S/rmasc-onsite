import { Pool } from 'pg';
import type { IPointageRepository } from './interfaces';
import type { EntreePointageGPS, CoordonneesGPS } from '../types/mission.types';

export class PointageRepository implements IPointageRepository {
  constructor(private readonly db: Pool) {}

  async enregistrer(d: { ordreMissionId: string; technicienId: string; type: 'arrivee'|'depart'; coordonnees: CoordonneesGPS; distanceChantierM: number; dansRayon: boolean }): Promise<EntreePointageGPS> {
    const { rows } = await this.db.query(
      `INSERT INTO journal_pointage_gps (ordre_mission_id, utilisateur_id, type_pointage, horodatage, position_gps, distance_chantier_m, dans_rayon)
       VALUES ($1, $2, $3, NOW(), ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7)
       RETURNING id, ordre_mission_id AS "ordreMissionId", utilisateur_id AS "technicienId", type_pointage AS "type",
                 horodatage, ST_X(position_gps::geometry) AS "latitude", ST_Y(position_gps::geometry) AS "longitude",
                 distance_chantier_m AS "distanceChantierM", dans_rayon AS "dansRayon"`,
      [d.ordreMissionId, d.technicienId, d.type, d.coordonnees.longitude, d.coordonnees.latitude, d.distanceChantierM, d.dansRayon]);
    const r = rows[0];
    return { id: r.id, ordreMissionId: r.ordreMissionId, technicienId: r.technicienId, type: r.type,
      horodatage: new Date(r.horodatage), coordonnees: { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) },
      distanceChantierM: r.distanceChantierM !== null ? parseFloat(r.distanceChantierM) : null, dansRayon: r.dansRayon };
  }

  async trouverDernierArrivee(missionId: string, technicienId: string): Promise<EntreePointageGPS | null> {
    const { rows } = await this.db.query(
      `SELECT id, ordre_mission_id AS "ordreMissionId", utilisateur_id AS "technicienId", type_pointage AS "type",
              horodatage, ST_X(position_gps::geometry) AS "latitude", ST_Y(position_gps::geometry) AS "longitude",
              distance_chantier_m AS "distanceChantierM", dans_rayon AS "dansRayon"
       FROM journal_pointage_gps WHERE ordre_mission_id = $1 AND utilisateur_id = $2 AND type_pointage = 'arrivee'
       ORDER BY horodatage DESC LIMIT 1`, [missionId, technicienId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return { id: r.id, ordreMissionId: r.ordreMissionId, technicienId: r.technicienId, type: r.type,
      horodatage: new Date(r.horodatage), coordonnees: { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) },
      distanceChantierM: r.distanceChantierM !== null ? parseFloat(r.distanceChantierM) : null, dansRayon: r.dansRayon };
  }
}
