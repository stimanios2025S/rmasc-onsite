-- ============================================================================
-- RMASC OnSite v4 — Géofencing zone de travail + alertes sortie + roadmap
-- ============================================================================
BEGIN;

-- ═══ 1. ZONE DE TRAVAIL (géofencing renforcé) ═══
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS zone_travail_rayon NUMERIC(6,1) DEFAULT 100.0;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS zone_travail_centre GEOGRAPHY(Point, 4326);

-- ═══ 2. SUIVI POSITION TECHNICIEN (pour détecter sorties) ═══
CREATE TABLE IF NOT EXISTS suivis_position_technicien (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    technicien_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    dans_zone BOOLEAN DEFAULT TRUE,
    horodatage TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ 3. ALERTES SORTIE DE ZONE ═══
CREATE TABLE IF NOT EXISTS alertes_zone (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    technicien_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'SORTIE_ZONE',
    message TEXT NOT NULL,
    est_resolue BOOLEAN DEFAULT FALSE,
    date_sortie TIMESTAMPTZ DEFAULT NOW(),
    date_retour TIMESTAMPTZ,
    lue BOOLEAN DEFAULT FALSE
);

-- ═══ 4. ROADMAP CHANTIER (historique des phases) ═══
CREATE TABLE IF NOT EXISTS roadmap_chantier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    phase VARCHAR(20) NOT NULL,
    equipe_id UUID REFERENCES equipes(id),
    statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
    date_debut TIMESTAMPTZ,
    date_fin TIMESTAMPTZ,
    date_creation TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
