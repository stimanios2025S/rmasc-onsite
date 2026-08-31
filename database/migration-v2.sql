-- ============================================================================
-- RMASC OnSite v2 — Migration : Demandes d'intégration + 15 Équipes + Repos
-- ============================================================================

BEGIN;

-- 1. ADD NEW STATUS TYPES
DROP TYPE IF EXISTS statut_equipe CASCADE;
CREATE TYPE statut_equipe AS ENUM ('DISPONIBLE','EN_MISSION','EN_REPOS');
DROP TYPE IF EXISTS statut_demande CASCADE;
CREATE TYPE statut_demande AS ENUM ('EN_ATTENTE_VALIDATION','APPROUVE','REFUSE');

-- 2. DEMANDES D'INTÉGRATION QUEUE
CREATE TABLE IF NOT EXISTS demandes_integration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_commande_erp VARCHAR(100) UNIQUE NOT NULL,
    client_nom VARCHAR(255) NOT NULL,
    client_telephone VARCHAR(20),
    adresse_chantier TEXT,
    nom_chantier VARCHAR(200),
    latitude NUMERIC(10,7) DEFAULT 45.75,
    longitude NUMERIC(10,7) DEFAULT 4.85,
    details_ascenseur JSONB,
    statut statut_demande DEFAULT 'EN_ATTENTE_VALIDATION',
    traite_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    traite_a TIMESTAMPTZ,
    date_creation TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ADD TEAM STATUS COLUMNS
ALTER TABLE equipes
ADD COLUMN IF NOT EXISTS disponible_a_partir_de TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS statut_equipe statut_equipe DEFAULT 'DISPONIBLE';

-- 4. ADD ESTIMATED DURATION COLUMNS TO ORDRES_DE_MISSION
ALTER TABLE ordres_de_mission
ADD COLUMN IF NOT EXISTS duree_estimee_jours NUMERIC(3,1);

-- 5. ADD MISSION-COMPLETED TRACKING FOR 3-DAY REST
ALTER TABLE ordres_de_mission
ADD COLUMN IF NOT EXISTS equipe_complete_id UUID REFERENCES equipes(id) ON DELETE SET NULL;

-- ═════════════════════════════════════════════════════════════════════
-- 15 ÉQUIPES DE TERRAIN
-- ═════════════════════════════════════════════════════════════════════

-- Clear existing demo teams and re-seed with 15
DELETE FROM utilisateurs WHERE identifiant IN (
    'jdupont','mmartin','plefevre','sbernard','admin',
    'meca1','meca2','meca3','meca4','meca5',
    'elec1','elec2','elec3','elec4','elec5',
    'verif1','verif2','verif3','verif4','verif5',
    'elghani'
);

DELETE FROM equipes WHERE nom LIKE 'Meca-%' OR nom LIKE 'Elec-%' OR nom LIKE 'Verif-%' OR nom='Mixte-Mobile';

-- Mechanical Teams (5)
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
    ('e1000000-0000-4000-8000-000000000001','Meca-Alpha','mecanique','#2196F3'),
    ('e1000000-0000-4000-8000-000000000002','Meca-Beta','mecanique','#1976D2'),
    ('e1000000-0000-4000-8000-000000000003','Meca-Gamma','mecanique','#1565C0'),
    ('e1000000-0000-4000-8000-000000000004','Meca-Delta','mecanique','#0D47A1'),
    ('e1000000-0000-4000-8000-000000000005','Meca-Epsilon','mecanique','#1E88E5');

-- Electrical Teams (5)
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
    ('e1000000-0000-4000-8000-000000000006','Elec-Omega','electrique','#FF9800'),
    ('e1000000-0000-4000-8000-000000000007','Elec-Sigma','electrique','#F57C00'),
    ('e1000000-0000-4000-8000-000000000008','Elec-Theta','electrique','#E65100'),
    ('e1000000-0000-4000-8000-000000000009','Elec-Zeta','electrique','#BF360C'),
    ('e1000000-0000-4000-8000-000000000010','Elec-Kappa','electrique','#FF6D00');

-- Verification/Inspector (5)
INSERT INTO equipes (id, nom, type, couleur_hex) VALUES
    ('e1000000-0000-4000-8000-000000000011','Verif-Prime','mixte','#4CAF50'),
    ('e1000000-0000-4000-8000-000000000012','Verif-Elite','mixte','#388E3C'),
    ('e1000000-0000-4000-8000-000000000013','Verif-Nova','mixte','#2E7D32'),
    ('e1000000-0000-4000-8000-000000000014','Verif-Apex','mixte','#1B5E20'),
    ('e1000000-0000-4000-8000-000000000015','Verif-Sentry','mixte','#43A047');

-- ═════════════════════════════════════════════════════════════════════
-- UTILISATEURS (team accounts + admin)
-- ═════════════════════════════════════════════════════════════════════

-- El Ghani — Super Admin
INSERT INTO utilisateurs (id, identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id) VALUES
    ('u0000000-0000-4000-8000-000000000000','elghani','elghani@rmasc.dz',
     '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
     'El','Ghani','administrateur',NULL)
ON CONFLICT (identifiant) DO NOTHING;

-- Mechanical Team Accounts
INSERT INTO utilisateurs (id, identifiant, email, mot_de_passe_hash, prenom, nom, role, equipe_id) VALUES
    ('u1000000-0000-4000-8000-000000000001','meca1','meca1@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Meca-Alpha','technicien','e1000000-0000-4000-8000-000000000001'),
    ('u1000000-0000-4000-8000-000000000002','meca2','meca2@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Meca-Beta','technicien','e1000000-0000-4000-8000-000000000002'),
    ('u1000000-0000-4000-8000-000000000003','meca3','meca3@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Meca-Gamma','technicien','e1000000-0000-4000-8000-000000000003'),
    ('u1000000-0000-4000-8000-000000000004','meca4','meca4@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Meca-Delta','technicien','e1000000-0000-4000-8000-000000000004'),
    ('u1000000-0000-4000-8000-000000000005','meca5','meca5@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Meca-Epsilon','technicien','e1000000-0000-4000-8000-000000000005'),
-- Electrical Team Accounts
    ('u1000000-0000-4000-8000-000000000006','elec1','elec1@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Elec-Omega','technicien','e1000000-0000-4000-8000-000000000006'),
    ('u1000000-0000-4000-8000-000000000007','elec2','elec2@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Elec-Sigma','technicien','e1000000-0000-4000-8000-000000000007'),
    ('u1000000-0000-4000-8000-000000000008','elec3','elec3@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Elec-Theta','technicien','e1000000-0000-4000-8000-000000000008'),
    ('u1000000-0000-4000-8000-000000000009','elec4','elec4@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Elec-Zeta','technicien','e1000000-0000-4000-8000-000000000009'),
    ('u1000000-0000-4000-8000-000000000010','elec5','elec5@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Elec-Kappa','technicien','e1000000-0000-4000-8000-000000000010'),
-- Verification Team Accounts
    ('u1000000-0000-4000-8000-000000000011','verif1','verif1@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Verif-Prime','ingenieur','e1000000-0000-4000-8000-000000000011'),
    ('u1000000-0000-4000-8000-000000000012','verif2','verif2@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Verif-Elite','ingenieur','e1000000-0000-4000-8000-000000000012'),
    ('u1000000-0000-4000-8000-000000000013','verif3','verif3@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Verif-Nova','ingenieur','e1000000-0000-4000-8000-000000000013'),
    ('u1000000-0000-4000-8000-000000000014','verif4','verif4@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Verif-Apex','ingenieur','e1000000-0000-4000-8000-000000000014'),
    ('u1000000-0000-4000-8000-000000000015','verif5','verif5@rmasc.dz','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','Equipe','Verif-Sentry','ingenieur','e1000000-0000-4000-8000-000000000015')
ON CONFLICT (identifiant) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- DURÉES ESTIMÉES PAR PHASE (config)
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS configuration_phases (
    phase phase_mission PRIMARY KEY,
    duree_estimee_jours NUMERIC(3,1) NOT NULL,
    description TEXT
);

-- ═════════════════════════════════════════════════════════════════════
-- FONCTION : 3-day rest after mission completion
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        -- Set the team to repos for 3 days
        UPDATE equipes
        SET statut_equipe = 'EN_REPOS',
            disponible_a_partir_de = NOW() + INTERVAL '3 days'
        WHERE id = NEW.equipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repos_equipe ON ordres_de_mission;
CREATE TRIGGER trg_repos_equipe
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION appliquer_repos_equipe();

-- Seed phase durations
INSERT INTO configuration_phases (phase, duree_estimee_jours, description) VALUES
    ('mecanique', 4.0, 'Installation mécanique complète'),
    ('electrique', 3.0, 'Câblage et branchements électriques'),
    ('verification', 1.0, 'Contrôle qualité et tests finaux')
ON CONFLICT (phase) DO UPDATE SET duree_estimee_jours = EXCLUDED.duree_estimee_jours;

COMMIT;
