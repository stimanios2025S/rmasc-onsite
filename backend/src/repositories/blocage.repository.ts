import { Pool } from 'pg';
import type { IBlocageRepository } from './interfaces';
import type { Blocage, StatutBlocage } from '../types/mission.types';

export class BlocageRepository implements IBlocageRepository {
  constructor(private readonly db: Pool) {}

  async creer(d: { ordreMissionId: string; declarePar: string; raisonBlocage: string; idPieceERP: string|null; priorite: string; urlsPhotos: string[] }): Promise<Blocage> {
    const { rows } = await this.db.query(
      `INSERT INTO blocages_et_requisitions (ordre_mission_id, declare_par, raison_blocage, id_piece_erp, priorite, urls_photos, statut)
       VALUES ($1, $2, $3, $4, $5, $6, 'ouvert')
       RETURNING id, ordre_mission_id AS "ordreMissionId", declare_par AS "declarePar", raison_blocage AS "raisonBlocage",
                 id_piece_erp AS "idPieceERP", priorite, urls_photos AS "urlsPhotos", statut, date_creation AS "dateCreation"`,
      [d.ordreMissionId, d.declarePar, d.raisonBlocage, d.idPieceERP, d.priorite, d.urlsPhotos]);
    const r = rows[0];
    return { id: r.id, ordreMissionId: r.ordreMissionId, declarePar: r.declarePar, raisonBlocage: r.raisonBlocage,
      idPieceERP: r.idPieceERP, priorite: r.priorite, urlsPhotos: r.urlsPhotos ?? [], statut: r.statut, dateCreation: new Date(r.dateCreation) };
  }

  async trouverActifParMission(missionId: string): Promise<Blocage[]> {
    const { rows } = await this.db.query(
      `SELECT id, ordre_mission_id AS "ordreMissionId", declare_par AS "declarePar", raison_blocage AS "raisonBlocage",
              id_piece_erp AS "idPieceERP", priorite, urls_photos AS "urlsPhotos", statut, date_creation AS "dateCreation"
       FROM blocages_et_requisitions WHERE ordre_mission_id = $1 AND statut IN ('ouvert','en_cours')
       ORDER BY CASE priorite WHEN 'critique' THEN 0 WHEN 'haute' THEN 1 WHEN 'moyenne' THEN 2 WHEN 'basse' THEN 3 END, date_creation DESC`,
      [missionId]);
    return rows.map((r: any) => ({
      id: r.id, ordreMissionId: r.ordreMissionId, declarePar: r.declarePar, raisonBlocage: r.raisonBlocage,
      idPieceERP: r.idPieceERP, priorite: r.priorite, urlsPhotos: r.urlsPhotos ?? [], statut: r.statut, dateCreation: new Date(r.dateCreation),
    }));
  }

  async mettreAJourStatut(id: string, statut: StatutBlocage): Promise<void> {
    await this.db.query(
      `UPDATE blocages_et_requisitions SET statut = $1${statut === 'resolu' ? ', date_resolution = NOW()' : ''}, date_modification = NOW() WHERE id = $2`,
      [statut, id]);
  }
}
