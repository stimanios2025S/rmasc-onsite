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
      {"id":"m3","label":"Installation des rails guides","done":false},
      {"id":"m4","label":"Mise en place de châssis moteur et le moteur","done":false},
      {"id":"m5","label":"Installation de l'arcade avec plateau + le contrepoids","done":false},
      {"id":"m6","label":"L'élingue et l'attelage","done":false},
      {"id":"m7","label":"Installation de régulateur de vitesse et la poulie bandée","done":false},
      {"id":"m8","label":"L'inspection","done":false},
      {"id":"m9","label":"Installation des portes paliers","done":false},
      {"id":"m10","label":"Installation de la cabine","done":false},
      {"id":"m11","label":"Installation des portes cabine","done":false},
      {"id":"m12","label":"L'équilibrage du contrepoids — PCP = P. cabine 1/2 la charge nominale","done":false},
      {"id":"m13","label":"Installation de l'échelle et les ressorts dans la cuve","done":false}
    ]'::jsonb;
  ELSIF phase = 'electrique' THEN
    RETURN '[
      {"id":"e1","label":"Installation de l''armoire électrique","done":false},
      {"id":"e2","label":"Raccordement du moteur","done":false},
      {"id":"e3","label":"Installation du pendentif","done":false},
      {"id":"e4","label":"Installation de la boîte d''inspection","done":false},
      {"id":"e5","label":"Installation de la colonne électrique","done":false},
      {"id":"e6","label":"Installation des boutons d''appel paliers","done":false},
      {"id":"e7","label":"Installation des capteurs et le COP (poste à boutons)","done":false},
      {"id":"e8","label":"Mise en place des aimants","done":false},
      {"id":"e9","label":"Vérification générale","done":false},
      {"id":"e10","label":"Réglage des étapes — l''apprentissage","done":false}
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
