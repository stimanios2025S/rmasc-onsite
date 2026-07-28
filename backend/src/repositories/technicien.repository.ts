import { Pool } from 'pg';
import type { ITechnicienRepository, Technicien } from '../types/mission.types';

export class TechnicienRepository implements ITechnicienRepository {
  constructor(private readonly db: Pool) {}

  async trouverParId(id: string): Promise<Technicien | null> {
    const { rows } = await this.db.query(
      `SELECT id, prenom, nom, email, telephone, equipe_id AS "equipeId", actif
       FROM utilisateurs WHERE id = $1 AND role IN ('technicien','ingenieur')`, [id]);
    return rows[0] ?? null;
  }

  async trouverParEquipe(equipeId: string): Promise<Technicien[]> {
    const { rows } = await this.db.query(
      `SELECT id, prenom, nom, email, telephone, equipe_id AS "equipeId", actif
       FROM utilisateurs WHERE equipe_id = $1 AND actif = TRUE`, [equipeId]);
    return rows;
  }
}
