-- ============================================================================
-- RMASC OnSite v9 — DEMANDES DE MATÉRIEL + SIGNALEMENTS PROBLÈMES
-- ============================================================================
BEGIN;

-- ═══ TABLE : demandes_materiel ═══
CREATE TABLE IF NOT EXISTS demandes_materiel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
    items JSONB NOT NULL DEFAULT '[]',  -- [{nom, quantite, categorie}]
    description TEXT,
    photo_url TEXT,
    type_demande VARCHAR(30) NOT NULL DEFAULT 'materiel', -- materiel / retard / probleme
    statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE / EN_COURS / TRAITE / REFUSE
    pdf_url TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demandes_materiel_equipe ON demandes_materiel(equipe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_materiel_chantier ON demandes_materiel(chantier_id);
CREATE INDEX IF NOT EXISTS idx_demandes_materiel_statut ON demandes_materiel(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_materiel_type ON demandes_materiel(type_demande);

COMMIT;
