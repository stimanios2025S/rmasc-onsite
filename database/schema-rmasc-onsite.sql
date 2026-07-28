-- ============================================================================
-- RMASC OnSite - Schéma de base de données PostgreSQL / PostGIS
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TYPES ÉNUMÉRÉS
-- ============================================================================

CREATE TYPE type_equipe AS ENUM ('mecanique','electrique','mixte');
CREATE TYPE role_utilisateur AS ENUM ('ingenieur','technicien','dispatcher','administrateur');
CREATE TYPE phase_mission AS ENUM ('mecanique','electrique','verification');
CREATE TYPE statut_mission AS ENUM ('en_attente','en_cours','bloque','termine');
CREATE TYPE statut_blocage AS ENUM ('ouvert','en_cours','resolu');
CREATE TYPE niveau_priorite AS ENUM ('basse','moyenne','haute','critique');
CREATE TYPE type_pointage_gps AS ENUM ('arrivee','depart');
CREATE TYPE statut_chantier AS ENUM ('planifie','en_cours','termine','suspendu','reception_officielle');

-- ============================================================================
-- FONCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION maj_horodatage()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE : equipes
-- ============================================================================
CREATE TABLE equipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    type type_equipe NOT NULL,
    description TEXT,
    couleur_hex VARCHAR(7),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_equipes_nom UNIQUE (nom)
);

-- ============================================================================
-- TABLE : utilisateurs
-- ============================================================================
CREATE TABLE utilisateurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identifiant VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    telephone VARCHAR(20),
    role role_utilisateur NOT NULL,
    equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    derniere_connexion TIMESTAMPTZ,
    CONSTRAINT uk_utilisateurs_identifiant UNIQUE (identifiant),
    CONSTRAINT uk_utilisateurs_email UNIQUE (email)
);

-- ============================================================================
-- TABLE : chantiers (avec colonne géographique PostGIS)
-- ============================================================================
CREATE TABLE chantiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_commande_erp VARCHAR(50) NOT NULL,
    nom_chantier VARCHAR(200) NOT NULL,
    adresse TEXT,
    coordonnees GEOGRAPHY(Point, 4326) NOT NULL,
    rayon_geofencing NUMERIC(6,1) NOT NULL DEFAULT 50.0,
    statut statut_chantier NOT NULL DEFAULT 'planifie',
    instructions_acces TEXT,
    client_nom VARCHAR(200),
    client_telephone VARCHAR(20),
    date_debut_prevue TIMESTAMPTZ,
    date_fin_prevue TIMESTAMPTZ,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_chantiers_ref_erp UNIQUE (reference_commande_erp),
    CONSTRAINT ck_rayon_geofencing_positif CHECK (rayon_geofencing > 0)
);

CREATE INDEX idx_chantiers_coordonnees ON chantiers USING GIST (coordonnees);

-- ============================================================================
-- TABLE : ordres_de_mission
-- ============================================================================
CREATE TABLE ordres_de_mission (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
    equipe_id UUID NOT NULL REFERENCES equipes(id) ON DELETE RESTRICT,
    phase phase_mission NOT NULL,
    statut statut_mission NOT NULL DEFAULT 'en_attente',
    priorite niveau_priorite NOT NULL DEFAULT 'moyenne',
    date_declenchement TIMESTAMPTZ,
    declenche_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    date_debut_effectif TIMESTAMPTZ,
    date_fin_effectif TIMESTAMPTZ,
    notes TEXT,
    signature_client TEXT,
    photos_verification TEXT[],
    checklist_qa JSONB,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mission_unique_phase_chantier UNIQUE (chantier_id, phase)
);

CREATE INDEX idx_ordres_mission_statut ON ordres_de_mission (statut);
CREATE INDEX idx_ordres_mission_phase ON ordres_de_mission (phase);
CREATE INDEX idx_ordres_mission_chantier_phase ON ordres_de_mission (chantier_id, phase);
CREATE INDEX idx_ordres_mission_equipe ON ordres_de_mission (equipe_id);

-- ============================================================================
-- TABLE : journal_pointage_gps
-- ============================================================================
CREATE TABLE journal_pointage_gps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordre_mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    type_pointage type_pointage_gps NOT NULL,
    horodatage TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    position_gps GEOGRAPHY(Point, 4326) NOT NULL,
    distance_chantier_m NUMERIC(10,1),
    dans_rayon BOOLEAN NOT NULL DEFAULT FALSE,
    appareil_id VARCHAR(100),
    batterie_pct SMALLINT CHECK (batterie_pct BETWEEN 0 AND 100),
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_distance_positive CHECK (distance_chantier_m IS NULL OR distance_chantier_m >= 0)
);

CREATE INDEX idx_pointage_gps_position ON journal_pointage_gps USING GIST (position_gps);
CREATE INDEX idx_pointage_gps_mission_user ON journal_pointage_gps (ordre_mission_id, utilisateur_id, horodatage DESC);
CREATE INDEX idx_pointage_gps_user_recent ON journal_pointage_gps (utilisateur_id, horodatage DESC);

-- ============================================================================
-- TABLE : blocages_et_requisitions
-- ============================================================================
CREATE TABLE blocages_et_requisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordre_mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    declare_par UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE SET NULL,
    raison_blocage TEXT NOT NULL,
    categorie VARCHAR(50),
    id_piece_erp VARCHAR(50),
    quantite_requise INTEGER CHECK (quantite_requise IS NULL OR quantite_requise > 0),
    priorite niveau_priorite NOT NULL DEFAULT 'moyenne',
    urls_photos TEXT[],
    statut statut_blocage NOT NULL DEFAULT 'ouvert',
    resolu_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    date_resolution TIMESTAMPTZ,
    commentaire_resolution TEXT,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocages_actifs_priorite ON blocages_et_requisitions (priorite DESC, date_creation ASC) WHERE statut IN ('ouvert','en_cours');
CREATE INDEX idx_blocages_mission ON blocages_et_requisitions (ordre_mission_id, date_creation DESC);
CREATE INDEX idx_blocages_categorie_statut ON blocages_et_requisitions (categorie, statut);

-- ============================================================================
-- TRIGGER : Calcul automatique distance et conformité géofencing
-- ============================================================================
CREATE OR REPLACE FUNCTION calculer_distance_et_conformite()
RETURNS TRIGGER AS $$
DECLARE v_centre GEOGRAPHY(Point,4326); v_rayon NUMERIC(6,1);
BEGIN
    SELECT c.coordonnees, c.rayon_geofencing INTO v_centre, v_rayon
    FROM ordres_de_mission om JOIN chantiers c ON c.id = om.chantier_id
    WHERE om.id = NEW.ordre_mission_id;
    IF v_centre IS NULL THEN RETURN NEW; END IF;
    NEW.distance_chantier_m := ST_Distance(NEW.position_gps, v_centre, true)::NUMERIC(10,1);
    NEW.dans_rayon := ST_DWithin(NEW.position_gps, v_centre, v_rayon);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pointage_gps_calcul
    BEFORE INSERT ON journal_pointage_gps
    FOR EACH ROW EXECUTE FUNCTION calculer_distance_et_conformite();

-- ============================================================================
-- TRIGGER : Déclenchement automatique de la phase suivante
-- ============================================================================
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE v_prochaine_phase phase_mission; v_equipe_type type_equipe; v_equipe_id UUID;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        v_prochaine_phase := CASE NEW.phase
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;
        IF v_prochaine_phase IS NOT NULL THEN
            v_equipe_type := CASE v_prochaine_phase
                WHEN 'mecanique' THEN 'mecanique'::type_equipe
                WHEN 'electrique' THEN 'electrique'::type_equipe
                WHEN 'verification' THEN 'mixte'::type_equipe
            END;
            SELECT e.id INTO v_equipe_id FROM equipes e
            WHERE e.type = v_equipe_type AND e.actif = TRUE
            ORDER BY (SELECT COUNT(*) FROM ordres_de_mission om WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
            LIMIT 1;
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, COALESCE(v_equipe_id, NEW.equipe_id), v_prochaine_phase, 'en_attente', NOW(),
                    'Déclenché auto depuis phase ' || NEW.phase);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mission_phase_suivante
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION declencher_phase_suivante();

-- ============================================================================
-- VUE : Tableau de bord dispatcher
-- ============================================================================
CREATE OR REPLACE VIEW vue_tableau_bord_dispatcher AS
SELECT c.id AS chantier_id, c.reference_commande_erp, c.nom_chantier, c.statut AS statut_chantier,
    om_meca.id AS mission_meca_id, om_meca.statut AS mission_meca_statut,
    om_elec.id AS mission_elec_id, om_elec.statut AS mission_elec_statut,
    om_verif.id AS mission_verif_id, om_verif.statut AS mission_verif_statut,
    (SELECT jp.horodatage FROM journal_pointage_gps jp JOIN ordres_de_mission om ON om.id = jp.ordre_mission_id WHERE om.chantier_id = c.id ORDER BY jp.horodatage DESC LIMIT 1) AS dernier_pointage,
    (SELECT COUNT(*) FROM blocages_et_requisitions b JOIN ordres_de_mission om ON om.id = b.ordre_mission_id WHERE om.chantier_id = c.id AND b.statut IN ('ouvert','en_cours')) AS blocages_actifs
FROM chantiers c
LEFT JOIN ordres_de_mission om_meca ON om_meca.chantier_id = c.id AND om_meca.phase = 'mecanique'
LEFT JOIN ordres_de_mission om_elec ON om_elec.chantier_id = c.id AND om_elec.phase = 'electrique'
LEFT JOIN ordres_de_mission om_verif ON om_verif.chantier_id = c.id AND om_verif.phase = 'verification'
ORDER BY blocages_actifs DESC, c.date_creation DESC;

-- ============================================================================
-- DONNÉES DE DÉMONSTRATION
-- ============================================================================
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
    ('a1000000-0000-4000-8000-000000000001','Meca-Nord','mecanique','#2196F3'),
    ('a1000000-0000-4000-8000-000000000002','Meca-Sud','mecanique','#1976D2'),
    ('a1000000-0000-4000-8000-000000000003','Elec-Nord','electrique','#FF9800'),
    ('a1000000-0000-4000-8000-000000000004','Elec-Sud','electrique','#E65100'),
    ('a1000000-0000-4000-8000-000000000005','Mixte-Mobile','mixte','#4CAF50')
ON CONFLICT (nom) DO NOTHING;

INSERT INTO utilisateurs (id, identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id) VALUES
    ('b2000000-0000-4000-8000-000000000001','jdupont','jdupont@rmasc.fr','hash_placeholder','Jean','Dupont','technicien','a1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000002','mmartin','mmartin@rmasc.fr','hash_placeholder','Marie','Martin','technicien','a1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000003','plefevre','plefevre@rmasc.fr','hash_placeholder','Pierre','Lefevre','ingenieur','a1000000-0000-4000-8000-000000000003'),
    ('b2000000-0000-4000-8000-000000000004','sbernard','sbernard@rmasc.fr','hash_placeholder','Sarah','Bernard','dispatcher',NULL),
    ('b2000000-0000-4000-8000-000000000005','admin','admin@rmasc.fr','hash_placeholder','Admin','RMASC','administrateur',NULL)
ON CONFLICT (identifiant) DO NOTHING;

INSERT INTO chantiers (id, reference_commande_erp, nom_chantier, adresse, coordonnees) VALUES
    ('c3000000-0000-4000-8000-000000000001','ERP-2026-07-001','Pharmacie Centrale Lyon','12 Rue de la République, 69001 Lyon',ST_GeogFromText('SRID=4326;POINT(4.8357 45.7640)')),
    ('c3000000-0000-4000-8000-000000000002','ERP-2026-07-002','Bureaux Tech3P Marseille','45 Avenue du Prado, 13008 Marseille',ST_GeogFromText('SRID=4326;POINT(5.3698 43.2695)')),
    ('c3000000-0000-4000-8000-000000000003','ERP-2026-07-003','Entrepôt Logistique Paris','88 Boulevard de Sébastopol, 75003 Paris',ST_GeogFromText('SRID=4326;POINT(2.3522 48.8566)'))
ON CONFLICT (reference_commande_erp) DO NOTHING;

COMMIT;
