-- ============================================================================
-- RMASC OnSite v10.1 — FIX PHASE RELAY (electrical team not assigned)
-- Fixes 4 critical bugs:
--   1. UNIQUE (chantier_id, phase) constraint blocks new missions after old ones are termine
--   2. Trigger skips creating next phase if a stale/termine mission exists
--   3. NOT NULL constraint on equipe_id crashes trigger when no team available
--   4. Backend fallback also crashes on NOT NULL when inserting without team
-- ============================================================================

-- ═══ USE SINGLE-STATEMENT TRANSACTION per fix (no BEGIN/COMMIT wrapper) ═══
-- Each statement auto-commits so failures don't block other fixes

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 1: Drop the UNIQUE (chantier_id, phase) constraint
--   This constraint prevents creating a NEW electrical mission when
--   an old termine one exists. We only need ONE ACTIVE mission per phase,
--   not one total. The trigger's logic handles deduplication.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_mission_unique_phase_chantier'
          AND conrelid = 'ordres_de_mission'::regclass
    ) THEN
        ALTER TABLE ordres_de_mission DROP CONSTRAINT uq_mission_unique_phase_chantier;
        RAISE NOTICE 'Dropped constraint uq_mission_unique_phase_chantier';
    ELSE
        RAISE NOTICE 'Constraint uq_mission_unique_phase_chantier already dropped';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 2: Ensure equipe_id allows NULL (for unassigned missions)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE ordres_de_mission ALTER COLUMN equipe_id DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 3: Replace the trigger function with a fixed version
--   Key change: duplicate check now EXCLUDES termine missions
--   so stale/completed missions don't block new ones
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE
    v_prochaine_phase phase_mission;
    v_equipe_type type_equipe;
    v_equipe_id UUID;
    v_equipe_nom VARCHAR;
    v_mission_id UUID;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
        -- 1. Determine next phase
        v_prochaine_phase := CASE NEW.phase
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;

        -- 2. If verification → chantier is complete
        IF NEW.phase = 'verification' THEN
            UPDATE chantiers SET statut = 'reception_officielle', date_modification = NOW()
            WHERE id = NEW.chantier_id;
            RETURN NEW;
        END IF;

        -- 3. No next phase → nothing to do
        IF v_prochaine_phase IS NULL THEN
            RETURN NEW;
        END IF;

        -- 4. Team type for next phase
        v_equipe_type := CASE v_prochaine_phase
            WHEN 'mecanique' THEN 'mecanique'::type_equipe
            WHEN 'electrique' THEN 'electrique'::type_equipe
            WHEN 'verification' THEN 'mixte'::type_equipe
        END;

        -- 5. CRITICAL FIX: Check for ACTIVE mission only (exclude termine!)
        --    Previously this checked for ANY mission, including completed ones,
        --    which blocked new missions from being created.
        IF EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = NEW.chantier_id
              AND om.phase = v_prochaine_phase
              AND om.statut NOT IN ('termine')
        ) THEN
            RETURN NEW;
        END IF;

        -- 6. Find least-loaded available team (rotation)
        SELECT e.id, e.nom INTO v_equipe_id, v_equipe_nom
        FROM equipes e
        WHERE e.type = v_equipe_type
          AND e.actif = TRUE
          AND e.id <> NEW.equipe_id
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
        LIMIT 1;

        -- 7. Create mission (with or without team)
        IF v_equipe_id IS NULL THEN
            -- No team available → create unassigned for manual admin assignment
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_prochaine_phase, 'en_attente', NOW(),
                    'Phase ' || v_prochaine_phase || ' — aucune equipe dispo, assignation manuelle requise')
            RETURNING id INTO v_mission_id;
        ELSE
            -- Mark team as in mission
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_equipe_id;

            -- Create the next phase mission
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_equipe_id, v_prochaine_phase, 'en_attente', NOW(),
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = v_prochaine_phase),
                    'Declenche auto depuis phase ' || NEW.phase)
            RETURNING id INTO v_mission_id;
        END IF;

        -- 8. Generate checklist
        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_prochaine_phase, generer_checklist(v_prochaine_phase::text));
        END IF;

        -- 9. Record in roadmap
        INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
        VALUES (NEW.chantier_id, v_prochaine_phase, v_equipe_id, 'EN_ATTENTE', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trg_mission_phase_suivante ON ordres_de_mission;
CREATE TRIGGER trg_mission_phase_suivante
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION declencher_phase_suivante();

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 3: Also ensure the repos trigger exists
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
        UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = NOW() + INTERVAL '3 days'
        WHERE id = NEW.equipe_id AND NEW.equipe_id IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repos_equipe ON ordres_de_mission;
CREATE TRIGGER trg_repos_equipe
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION appliquer_repos_equipe();

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 4: Clean up any stuck chantiers that have a termine electrical
-- mission but no active one (the stale mission problem)
-- This re-creates the electrical mission for any stuck chantiers.
-- ═══════════════════════════════════════════════════════════════════════

-- For each chantier that has a termine meca but a termine (or missing) elec,
-- and no active mission, create a fresh electrical mission.
DO $$
DECLARE
    r RECORD;
    v_eq_id UUID;
    v_mission UUID;
BEGIN
    FOR r IN
        SELECT c.id AS chantier_id, c.nom_chantier
        FROM chantiers c
        WHERE EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = c.id AND om.phase = 'mecanique' AND om.statut = 'termine'
        )
        AND NOT EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = c.id AND om.phase = 'electrique'
              AND om.statut IN ('en_attente', 'en_cours', 'en_route', 'bloque')
        )
        AND c.statut NOT IN ('reception_officielle', 'termine')
    LOOP
        -- Find available electrical team
        SELECT e.id INTO v_eq_id
        FROM equipes e
        WHERE e.type = 'electrique' AND e.actif = TRUE
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
        LIMIT 1;

        IF v_eq_id IS NOT NULL THEN
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_eq_id;
        END IF;

        INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
        VALUES (r.chantier_id, v_eq_id, 'electrique', 'en_attente', NOW(),
                'Phase electrique — re-cree par migration v10 (phase relay fix)')
        RETURNING id INTO v_mission;

        INSERT INTO checklists_phases (mission_id, phase, etapes)
        VALUES (v_mission, 'electrique', generer_checklist('electrique'));

        RAISE NOTICE 'Re-created electrical mission for chantier % (%)', r.nom_chantier, r.chantier_id;
    END LOOP;
END $$;
