-- ============================================================================
-- RMASC OnSite v3 — Migration : Complexité, Fichiers, Checklists, Retards
-- ============================================================================
BEGIN;

-- 1. COMPLEXITÉ
DROP TYPE IF EXISTS complexite_chantier CASCADE;
CREATE TYPE complexite_chantier AS ENUM ('FACILE','MOYENNE','DIFFICILE');

-- 2. DEMANDES_INTEGRATION: ajout fichiers + complexité
ALTER TABLE demandes_integration ADD COLUMN IF NOT EXISTS fiche_technique JSONB;
ALTER TABLE demandes_integration ADD COLUMN IF NOT EXISTS dxf_url TEXT;
ALTER TABLE demandes_integration ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE demandes_integration ADD COLUMN IF NOT EXISTS complexite complexite_chantier DEFAULT 'MOYENNE';

-- 3. CHANTIERS: ajout complexité
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS complexite complexite_chantier DEFAULT 'MOYENNE';
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS dxf_url TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS fiche_technique JSONB;

-- 4. CHECKLISTS PAR PHASE
CREATE TABLE IF NOT EXISTS checklists_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID NOT NULL REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    phase VARCHAR(20) NOT NULL,
    etapes JSONB NOT NULL DEFAULT '[]',
    complete BOOLEAN DEFAULT FALSE,
    date_mise_a_jour TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BLOCAGES: ajout colonnes retards + photos
ALTER TABLE blocages_et_requisitions ADD COLUMN IF NOT EXISTS step_id VARCHAR(20);
ALTER TABLE blocages_et_requisitions ADD COLUMN IF NOT EXISTS motif_retard TEXT;
ALTER TABLE blocages_et_requisitions ADD COLUMN IF NOT EXISTS photo_proof_url TEXT;
ALTER TABLE blocages_et_requisitions ADD COLUMN IF NOT EXISTS demande_par_admin BOOLEAN DEFAULT FALSE;

-- 6. TABLE UPLOADS
CREATE TABLE IF NOT EXISTS fichiers_chantier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
    ordre_mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE CASCADE,
    nom_fichier VARCHAR(255) NOT NULL,
    chemin VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'dxf','pdf','fiche_technique','photo_retard','photo_blocage'
    taille_bytes BIGINT,
    uploaded_by UUID REFERENCES utilisateurs(id),
    date_upload TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DEFAULT CHECKLIST JSON GENERATOR
CREATE OR REPLACE FUNCTION generer_checklist(phase text) RETURNS jsonb AS $$
BEGIN
  IF phase = 'mecanique' THEN
    RETURN '[
      {"id":"m1","label":"Arrivage au chantier","done":false},
      {"id":"m2","label":"Plombage de gaine","done":false},
      {"id":"m3","label":"Montage guidage/guiderail","done":false,"subtasks":[{"label":"Départ","done":false},{"label":"50%","done":false},{"label":"100%","done":false}]},
      {"id":"m4","label":"Montage de moteur et plombage de moteur","done":false},
      {"id":"m5","label":"Installation arcade et contrepoids","done":false},
      {"id":"m6","label":"Install régulateur de vitesse et poulies","done":false},
      {"id":"m7","label":"Install câbles de suspension et lingue","done":false},
      {"id":"m8","label":"Installation des plateaux","done":false},
      {"id":"m9","label":"Installation des portes","done":false,"subtasks":[{"label":"Départ","done":false},{"label":"50%","done":false},{"label":"100%","done":false}]},
      {"id":"m10","label":"Installation de cabine","done":false},
      {"id":"m11","label":"Installation des portes cabine","done":false},
      {"id":"m12","label":"Charger le contrepoids","done":false}
    ]'::jsonb;
  ELSIF phase = 'electrique' THEN
    RETURN '[
      {"id":"e1","label":"Installation armoire","done":false},
      {"id":"e2","label":"Installation pendentif","done":false},
      {"id":"e3","label":"Installation boîte inspection","done":false},
      {"id":"e4","label":"Installation bouton appel palier","done":false},
      {"id":"e5","label":"Installation bouton appel cabine","done":false},
      {"id":"e6","label":"Installation de colonne montante","done":false},
      {"id":"e7","label":"Raccordement machine","done":false},
      {"id":"e8","label":"Raccordement toit cabine et inspection","done":false},
      {"id":"e9","label":"Raccordement colonne","done":false},
      {"id":"e10","label":"Installation des aimants","done":false},
      {"id":"e11","label":"Les essais et réglages","done":false}
    ]'::jsonb;
  ELSE
    RETURN '[
      {"id":"v1","label":"Vérification et réception provisoire","done":false},
      {"id":"v2","label":"Réception définitive avec le client","done":false}
    ]'::jsonb;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;
