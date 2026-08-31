-- ============================================================================
-- Migration v12 — Fix lifecycle: en_pause enum, matinal en_route, admin fixes
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ADD 'en_pause' to statut_mission enum (pause was broken)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
    ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_pause' AFTER 'en_cours';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD 'en_route' to statut_mission enum (matinal en route tracking)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
    ALTER TYPE statut_mission ADD VALUE IF NOT EXISTS 'en_route' BEFORE 'en_cours';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reset any stuck missions (en_pause on old enum = broken state)
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE ordres_de_mission SET statut = 'en_cours' WHERE statut::text = 'en_pause';

COMMIT;
