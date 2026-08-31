import { Pool } from 'pg';
import type { IEquipeRepository } from './interfaces';
import type { Equipe, Phase } from '../types/mission.types';

export class EquipeRepository implements IEquipeRepository {
  constructor(private readonly db: Pool) {}

  async trouverParId(id: string): Promise<Equipe | null> {
    const { rows } = await this.db.query(`SELECT id, nom, type, actif FROM equipes WHERE id = $1`, [id]);
    return rows[0] ? { id: rows[0].id, nom: rows[0].nom, type: rows[0].type as Phase, actif: rows[0].actif } : null;
  }

  async trouverDisponible(type: Phase): Promise<Equipe | null> {
    const { rows } = await this.db.query(
      `SELECT e.id, e.nom, e.type, e.actif
       FROM equipes e
       WHERE e.type = $1 AND e.actif = TRUE
         AND e.statut_equipe = 'DISPONIBLE'
         AND (e.disponible_a_partir_de IS NULL OR e.disponible_a_partir_de <= NOW())
       ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
       LIMIT 1`, [type]);
    return rows[0] ? { id: rows[0].id, nom: rows[0].nom, type: rows[0].type as Phase, actif: rows[0].actif } : null;
  }
}
