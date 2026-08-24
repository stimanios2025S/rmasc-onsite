-- ============================================================================
-- RMASC OnSite v8 — TRACKING TEMPS RÉEL + POINTAGE JOURNÉE
-- GPS en route, pointage matinal/soir, pause, transfert méca→élec
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- 1. NOUVEAUX TYPES ÉNUMÉRÉS
-- ═══════════════════════════════════════════════════════════════════════

-- Extend statut_mission with new states for the journey lifecycle
ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_route' BEFORE 'en_attente';
ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_pause' AFTER 'en_cours';

-- New type for daily pointage
DO $$ BEGIN
  CREATE TYPE type_pointage_jour AS ENUM ('matinal','fin_journee','pause_debut','pause_fin','retour_shop');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. TABLE : pointages_jour (pointage matinal / fin journée)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pointages_jour (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
    type_pointage type_pointage_jour NOT NULL,
    horodatage TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    position_gps GEOGRAPHY(Point, 4326),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    distance_chantier_m NUMERIC(10,1),
    dans_rayon BOOLEAN DEFAULT FALSE,
    notes TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pointages_jour_equipe ON pointages_jour (equipe_id, horodatage DESC);
CREATE INDEX idx_pointages_jour_mission ON pointages_jour (mission_id, horodatage DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. TABLE : gps_tracking (position en temps réel pendant trajet)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gps_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    vitesse_kmh NUMERIC(6,1),
    precision_m NUMERIC(8,1),
    batterie_pct SMALLINT CHECK (batterie_pct BETWEEN 0 AND 100),
    timestamp_client TIMESTAMPTZ NOT NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gps_tracking_equipe ON gps_tracking (equipe_id, date_creation DESC);
CREATE INDEX idx_gps_tracking_mission ON gps_tracking (mission_id, date_creation DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. TABLE : pauses_journee (suivi des pauses / shop)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pauses_journee (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
    type_pause VARCHAR(30) NOT NULL DEFAULT 'pause',
    date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_fin TIMESTAMPTZ,
    motif TEXT,
    duree_minutes NUMERIC(8,1) GENERATED ALWAYS AS (
        CASE WHEN date_fin IS NOT NULL
             THEN EXTRACT(EPOCH FROM (date_fin - date_debut)) / 60
             ELSE NULL END
    ) STORED,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pauses_equipe ON pauses_journee (equipe_id, date_debut DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. AJOUTER colonne statut_equipe à equipes si pas déjà présente
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE equipes ADD COLUMN statut_equipe VARCHAR(20) DEFAULT 'DISPONIBLE';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE equipes ADD COLUMN disponible_a_partir_de TIMESTAMPTZ DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. VUE : positions équipes en temps réel (pour la carte admin)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vue_positions_equipes AS
WITH derniere_position AS (
    SELECT DISTINCT ON (gt.equipe_id)
        gt.equipe_id, gt.latitude, gt.longitude, gt.vitesse_kmh,
        gt.batterie_pct, gt.date_creation AS last_update,
        om.chantier_id, c.nom_chantier AS destination
    FROM gps_tracking gt
    LEFT JOIN ordres_de_mission om ON om.id = gt.mission_id
    LEFT JOIN chantiers c ON c.id = om.chantier_id
    ORDER BY gt.equipe_id, gt.date_creation DESC
)
SELECT dp.*, e.nom AS equipe_nom, e.type AS equipe_type,
       eqs.statut_equipe
FROM derniere_position dp
JOIN equipes e ON e.id = dp.equipe_id
LEFT JOIN equipes eqs ON eqs.id = dp.equipe_id
WHERE dp.last_update > NOW() - INTERVAL '2 hours';

-- ═══════════════════════════════════════════════════════════════════════
-- 7. FONCTION : Calcul distance pointage jour au chantier
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculer_distance_pointage_jour()
RETURNS TRIGGER AS $$
DECLARE v_centre GEOGRAPHY; v_rayon NUMERIC(6,1);
BEGIN
    IF NEW.mission_id IS NULL THEN RETURN NEW; END IF;
    SELECT c.coordonnees, c.rayon_geofencing INTO v_centre, v_rayon
    FROM ordres_de_mission om JOIN chantiers c ON c.id = om.chantier_id
    WHERE om.id = NEW.mission_id;
    IF v_centre IS NULL OR NEW.latitude IS NULL THEN RETURN NEW; END IF;
    NEW.position_gps := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
    NEW.distance_chantier_m := ST_Distance(NEW.position_gps, v_centre, true)::NUMERIC(10,1);
    NEW.dans_rayon := ST_DWithin(NEW.position_gps, v_centre, COALESCE(v_rayon, 50));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pointage_jour_calcul ON pointages_jour;
CREATE TRIGGER trg_pointage_jour_calcul
    BEFORE INSERT ON pointages_jour
    FOR EACH ROW EXECUTE FUNCTION calculer_distance_pointage_jour();

-- ═══════════════════════════════════════════════════════════════════════
-- 8. AUTO-UPDATE mission statut vers 'en_route' au pointage matinal
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_set_en_route()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type_pointage = 'matinal' AND NEW.mission_id IS NOT NULL THEN
        UPDATE ordres_de_mission SET statut = 'en_route', date_declenchement = NOW()
        WHERE id = NEW.mission_id AND statut = 'en_attente';
        UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = NEW.equipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_en_route ON pointages_jour;
CREATE TRIGGER trg_auto_en_route
    AFTER INSERT ON pointages_jour
    FOR EACH ROW EXECUTE FUNCTION auto_set_en_route();
