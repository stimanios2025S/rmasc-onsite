-- ============================================================================
-- Migration v23 — Repos par équipe depuis la page chantier
-- L'admin met une équipe en repos pour N jours sur un chantier précis :
-- missions mises en pause, planning décalé, nouvelles missions bloquées.
-- Arrêt anticipé possible (recalage automatique des dates restantes).
-- Idempotent — peut être rejoué sans risque.
-- ============================================================================

CREATE TABLE IF NOT EXISTS repos_chantier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    missions JSONB NOT NULL DEFAULT '[]',
    jours_prevus INTEGER NOT NULL DEFAULT 7,
    date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_fin_prevue TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    date_fin_effective TIMESTAMPTZ NULL,
    statut TEXT NOT NULL DEFAULT 'actif',
    motif TEXT NULL,
    cree_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repos_chantier_actif
  ON repos_chantier (chantier_id, equipe_id)
  WHERE statut = 'actif';

CREATE INDEX IF NOT EXISTS idx_repos_chantier_equipe
  ON repos_chantier (equipe_id, statut, date_fin_prevue);
