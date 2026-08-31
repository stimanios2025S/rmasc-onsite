-- ============================================================================
-- Migration v15 — Add deadline (date_echeance) to chantiers
-- ============================================================================

BEGIN;

-- Add deadline column to chantiers
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS date_echeance TIMESTAMPTZ;

-- Add deadline to ordres_de_mission for team deadline tracking
ALTER TABLE ordres_de_mission ADD COLUMN IF NOT EXISTS date_echeance TIMESTAMPTZ;

COMMIT;
