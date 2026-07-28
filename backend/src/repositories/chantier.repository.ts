import { Pool } from 'pg';
import type { IChantierRepository } from './interfaces';
import type { Chantier, StatutChantier } from '../types/mission.types';

export class ChantierRepository implements IChantierRepository {
  constructor(private readonly db: Pool) {}

  async trouverParId(id: string): Promise<Chantier | null> {
    const { rows } = await this.db.query(
      `SELECT id, reference_commande_erp AS "referenceERP", nom_chantier AS "nom",
              ST_X(coordonnees::geometry) AS "latitude", ST_Y(coordonnees::geometry) AS "longitude",
              rayon_geofencing AS "rayonGeofencing", statut
       FROM chantiers WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return this.map(rows[0]);
  }

  async trouverParReferenceERP(ref: string): Promise<Chantier | null> {
    const { rows } = await this.db.query(
      `SELECT id, reference_commande_erp AS "referenceERP", nom_chantier AS "nom",
              ST_X(coordonnees::geometry) AS "latitude", ST_Y(coordonnees::geometry) AS "longitude",
              rayon_geofencing AS "rayonGeofencing", statut
       FROM chantiers WHERE reference_commande_erp = $1`, [ref]);
    if (!rows[0]) return null;
    return this.map(rows[0]);
  }

  async mettreAJourStatut(id: string, statut: StatutChantier): Promise<void> {
    await this.db.query(`UPDATE chantiers SET statut = $1, date_modification = NOW() WHERE id = $2`, [statut, id]);
  }

  private map(r: any): Chantier {
    return {
      id: r.id, referenceERP: r.referenceERP, nom: r.nom,
      coordonnees: { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) },
      rayonGeofencing: parseFloat(r.rayonGeofencing), statut: r.statut,
    };
  }
}
