-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Magasinier (Warehouse Manager) — Equipment logistics role
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Table magasiniers
CREATE TABLE IF NOT EXISTS magasiniers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    identifiant VARCHAR(50) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    telephone VARCHAR(20),
    actif BOOLEAN DEFAULT TRUE,
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    derniere_connexion TIMESTAMPTZ
);

-- 2. Junction table: magasiniers ↔ chantiers
CREATE TABLE IF NOT EXISTS magasinier_chantiers (
    magasinier_id UUID REFERENCES magasiniers(id) ON DELETE CASCADE,
    chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
    PRIMARY KEY (magasinier_id, chantier_id)
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_magasinier_chantiers_chantier ON magasinier_chantiers(chantier_id);
CREATE INDEX IF NOT EXISTS idx_magasinier_chantiers_magasinier ON magasinier_chantiers(magasinier_id);
