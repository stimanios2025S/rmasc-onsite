import { Pool } from 'pg';
import { eventBus } from './events/event-bus';

/**
 * Repos-chantier Service — repos ciblé par équipe depuis la page chantier.
 *
 * Règle métier (validée) :
 *  - périmètre = UNE équipe sur UN chantier (pas tout le chantier)
 *  - démarrage : missions actives de l'équipe sur ce chantier → en_pause,
 *    équipe → EN_REPOS, planning décalé de +N jours
 *  - arrêt anticipé : recalage automatique (on retire les jours restants),
 *    missions reprises, équipe DISPONIBLE
 *  - fin naturelle : les dates décalées sont conservées, missions reprises
 *  - tant qu'un repos est actif, aucune nouvelle mission ne peut être
 *    créée/assignée à cette équipe sur ce chantier (garde reposActif())
 */

export interface ReposMissionSnap {
  id: string;
  phase: string;
  ancien_statut: string;
}

/** Y a-t-il un repos actif pour (chantier, équipe) ? */
export async function reposActif(
  pool: Pool, chantierId: string, equipeId: string
): Promise<{ actif: boolean; date_fin_prevue?: string; equipe_nom?: string }> {
  const { rows } = await pool.query(
    `SELECT rc.date_fin_prevue, e.nom AS equipe_nom
     FROM repos_chantier rc
     JOIN equipes e ON e.id = rc.equipe_id
     WHERE rc.chantier_id = $1 AND rc.equipe_id = $2 AND rc.statut = 'actif'
     ORDER BY rc.date_creation DESC LIMIT 1`,
    [chantierId, equipeId]
  );
  if (rows.length === 0) return { actif: false };
  return { actif: true, date_fin_prevue: rows[0].date_fin_prevue, equipe_nom: rows[0].equipe_nom };
}

/** Jours restants (arrondi sup) avant la fin prévue d'un repos. */
export function joursRestants(dateFinPrevue: string | Date): number {
  const ms = new Date(dateFinPrevue).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/**
 * Bascule les repos expirés (date_fin_prevue <= NOW, statut actif) :
 * missions reprises, équipes libérées, lignes marquées terminées.
 * Idempotent — peut tourner à chaque lecture sans effet de bord.
 * Retourne le nombre de repos clôturés.
 */
export async function sweepReposExpires(pool: Pool, equipeId?: string): Promise<number> {
  const params: any[] = [];
  let filtreEquipe = '';
  if (equipeId) {
    filtreEquipe = 'AND rc.equipe_id = $1';
    params.push(equipeId);
  }
  const { rows: expires } = await pool.query(
    `SELECT rc.id, rc.chantier_id, rc.equipe_id, rc.missions,
            c.nom_chantier, e.nom AS equipe_nom
     FROM repos_chantier rc
     JOIN chantiers c ON c.id = rc.chantier_id
     JOIN equipes e ON e.id = rc.equipe_id
     WHERE rc.statut = 'actif' AND rc.date_fin_prevue <= NOW() ${filtreEquipe}
     ORDER BY rc.date_fin_prevue`,
    params
  );
  for (const r of expires) {
    await cloturerRepos(pool, r.id, r.missions as ReposMissionSnap[], false);
    try {
      eventBus.emit('repos_chantier', {
        action: 'expire',
        chantierId: r.chantier_id, chantierNom: r.nom_chantier,
        equipeId: r.equipe_id, equipeNom: r.equipe_nom,
        message: `😴 Repos terminé — ${r.equipe_nom} de nouveau disponible sur "${r.nom_chantier}"`,
      });
    } catch (_) { /* SSE non critique */ }
  }
  return expires.length;
}

/**
 * Clôture interne d'un repos (expire OU arrêt anticipé déjà recalé).
 * - missions encore en_pause → restaurées à leur ancien statut
 * - équipe → DISPONIBLE sauf si un AUTRE repos actif la retient
 * - ligne repos → termine
 */
export async function cloturerRepos(
  pool: Pool, reposId: string, missions: ReposMissionSnap[], anticipe: boolean
): Promise<void> {
  // 1. Restaurer les missions encore en pause
  for (const m of missions || []) {
    await pool.query(
      `UPDATE ordres_de_mission SET statut = $2::statut_mission, date_modification = NOW()
       WHERE id = $1 AND statut = 'en_pause'`,
      [m.id, m.ancien_statut]
    );
  }
  // 2. Équipe : retenue par un autre repos actif ?
  const info = await pool.query(`SELECT chantier_id, equipe_id FROM repos_chantier WHERE id = $1`, [reposId]);
  const equipeId = info.rows[0]?.equipe_id;
  if (equipeId) {
    const autres = await pool.query(
      `SELECT MAX(date_fin_prevue) AS max_fin FROM repos_chantier
       WHERE equipe_id = $1 AND statut = 'actif' AND id <> $2`,
      [equipeId, reposId]
    );
    if (autres.rows[0]?.max_fin) {
      await pool.query(
        `UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = $2,
                date_modification = NOW() WHERE id = $1`,
        [equipeId, autres.rows[0].max_fin]
      );
    } else {
      await pool.query(
        `UPDATE equipes SET statut_equipe = 'DISPONIBLE', disponible_a_partir_de = NOW(),
                date_modification = NOW() WHERE id = $1`,
        [equipeId]
      );
    }
  }
  // 3. Marquer terminé
  await pool.query(
    `UPDATE repos_chantier
     SET statut = 'termine',
         date_fin_effective = CASE WHEN $2 THEN NOW() ELSE date_fin_prevue END,
         date_modification = NOW()
     WHERE id = $1`,
    [reposId, anticipe]
  );
}
