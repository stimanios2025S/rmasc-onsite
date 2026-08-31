import { Pool } from 'pg';
import type { IMissionRepository } from './interfaces';
import type { OrdreMission, Phase, StatutMission } from '../types/mission.types';

const SELECT_MISSION = `SELECT id, chantier_id AS "chantierId", equipe_id AS "equipeId", phase, statut, priorite,
  date_declenchement AS "dateDeclenchement", date_debut_effectif AS "dateDebutEffectif",
  date_fin_effectif AS "dateFinEffectif" FROM ordres_de_mission`;

export class MissionRepository implements IMissionRepository {
  constructor(private readonly db: Pool) {}

  private map(l: any): OrdreMission {
    return {
      id: l.id, chantierId: l.chantierId, equipeId: l.equipeId,
      phase: l.phase, statut: l.statut, priorite: l.priorite ?? 'moyenne',
      dateDeclenchement: l.dateDeclenchement ? new Date(l.dateDeclenchement) : null,
      dateDebutEffectif: l.dateDebutEffectif ? new Date(l.dateDebutEffectif) : null,
      dateFinEffectif: l.dateFinEffectif ? new Date(l.dateFinEffectif) : null,
    };
  }

  async trouverParId(id: string): Promise<OrdreMission | null> {
    const { rows } = await this.db.query(`${SELECT_MISSION} WHERE id = $1`, [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async trouverActiveParChantierEtPhase(chantierId: string, phase: Phase): Promise<OrdreMission | null> {
    const { rows } = await this.db.query(
      `${SELECT_MISSION} WHERE chantier_id = $1 AND phase = $2 AND statut IN ('en_attente','en_cours') LIMIT 1`, [chantierId, phase]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async trouverEnCoursParEquipe(equipeId: string): Promise<OrdreMission | null> {
    const { rows } = await this.db.query(
      `${SELECT_MISSION} WHERE equipe_id = $1 AND statut = 'en_cours' LIMIT 1`, [equipeId]);
    return rows[0] ? this.map(rows[0]) : null;
  }

  async creer(d: { chantierId: string; equipeId: string; phase: Phase; notes?: string }): Promise<OrdreMission> {
    const { rows } = await this.db.query(
      `INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
       VALUES ($1, $2, $3, 'en_attente', NOW(), $4)
       RETURNING id, chantier_id AS "chantierId", equipe_id AS "equipeId", phase, statut, priorite,
                 date_declenchement AS "dateDeclenchement", date_debut_effectif AS "dateDebutEffectif", date_fin_effectif AS "dateFinEffectif"`,
      [d.chantierId, d.equipeId, d.phase, d.notes ?? null]);
    return this.map(rows[0]);
  }

  async mettreAJourStatut(id: string, statut: StatutMission): Promise<void> {
    await this.db.query(`UPDATE ordres_de_mission SET statut = $1, date_modification = NOW() WHERE id = $2`, [statut, id]);
  }

  async mettreAJourDates(id: string, debut: Date | null, fin: Date | null): Promise<void> {
    await this.db.query(
      `UPDATE ordres_de_mission SET date_debut_effectif = $1, date_fin_effectif = $2, date_modification = NOW() WHERE id = $3`,
      [debut, fin, id]);
  }
}
