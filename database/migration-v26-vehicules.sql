-- ═══════════════════════════════════════════════════════════════════
-- Migration v26 — VÉHICULES GPS (GeoFlotte) + assignation optionnelle
-- ═══════════════════════════════════════════════════════════════════
-- 1) Table véhicules : flotte de la société (gérée par l'admin)
CREATE TABLE IF NOT EXISTS vehicules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom VARCHAR(100) NOT NULL,
  immatriculation VARCHAR(30),
  imei VARCHAR(30),
  geoflotte_id VARCHAR(50),
  statut VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE'
    CHECK (statut IN ('DISPONIBLE','EN_MISSION','EN_PANNE')),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_vehicules_nom UNIQUE (nom)
);

-- 2) Positions GPS : 1 ligne par véhicule (dernière position connue, écrasée à chaque polling)
CREATE TABLE IF NOT EXISTS vehicules_positions (
  vehicule_id UUID PRIMARY KEY REFERENCES vehicules(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  vitesse_kmh INTEGER NOT NULL DEFAULT 0,
  en_mouvement BOOLEAN NOT NULL DEFAULT FALSE,
  adresse TEXT,
  date_position TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_reception TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Historique : qui a pris quel véhicule, quand, pour quel chantier
CREATE TABLE IF NOT EXISTS vehicules_affectations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicule_id UUID NOT NULL REFERENCES vehicules(id) ON DELETE CASCADE,
  equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL,
  mission_id UUID REFERENCES ordres_de_mission(id) ON DELETE SET NULL,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  date_debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_fin TIMESTAMPTZ,
  statut VARCHAR(20) NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','terminee')),
  cree_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_veh_aff_vehicule ON vehicules_affectations (vehicule_id, statut);
CREATE INDEX IF NOT EXISTS idx_veh_aff_equipe ON vehicules_affectations (equipe_id, statut);

-- 4) Mission → véhicule (optionnel) : la mission garde la trace de son véhicule
ALTER TABLE ordres_de_mission ADD COLUMN IF NOT EXISTS vehicule_id UUID REFERENCES vehicules(id) ON DELETE SET NULL;

-- 5) Usine RMASC : mémorisée pour toujours → "rmasc" trouvé instantanément sur la carte
INSERT INTO lieux_connus (nom, adresse, coordonnees, source, nb_confirmations)
VALUES ('RMASC', 'Usine RMASC — Algérie', ST_SetSRID(ST_MakePoint(3.0588, 36.7535), 4326), 'admin', 10)
ON CONFLICT (nom) DO UPDATE SET nb_confirmations = lieux_connus.nb_confirmations + 10,
                                date_modification = NOW();
