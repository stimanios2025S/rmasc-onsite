-- ============================================================================
-- Migration v13 — Ensure all required tables exist (idempotent safety net)
-- Run this if migrations weren't applied in order
-- ============================================================================

BEGIN;

-- parametres_systeme (from v11)
CREATE TABLE IF NOT EXISTS parametres_systeme (
    cle VARCHAR(50) PRIMARY KEY,
    valeur TEXT NOT NULL,
    description TEXT,
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO parametres_systeme (cle, valeur, description) VALUES
    ('jours_repos', '3', 'Nombre de jours de repos obligatoire après une mission terminée')
ON CONFLICT (cle) DO NOTHING;

-- Ensure en_route and en_pause exist in statut_mission enum (from v12)
DO $$ BEGIN
    ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_route' BEFORE 'en_cours';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_pause' AFTER 'en_cours';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure pauses_journee table exists (needed for pause alerts)
CREATE TABLE IF NOT EXISTS pauses_journee (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id),
    mission_id UUID REFERENCES ordres_de_mission(id),
    type_pause VARCHAR(30) NOT NULL DEFAULT 'pause_repos',
    date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_fin TIMESTAMPTZ,
    motif TEXT
);

-- Ensure demandes_materiel table exists (needed for material requests)
CREATE TABLE IF NOT EXISTS demandes_materiel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id),
    chantier_id UUID REFERENCES chantiers(id),
    mission_id UUID REFERENCES ordres_de_mission(id),
    type_demande VARCHAR(30) NOT NULL DEFAULT 'materiel',
    statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
    description TEXT,
    items JSONB DEFAULT '[]',
    pdf_url TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
