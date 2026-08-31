-- ============================================================================
-- Migration v18 — Fix deterministic team assignment + admin repos management
-- ============================================================================

BEGIN;

-- 1. Fix the phase relay trigger to use deterministic ordering
--    (least loaded + oldest team first, not random)
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE
    v_prochaine_phase phase_mission;
    v_equipe_type type_equipe;
    v_equipe_id UUID;
    v_equipe_nom TEXT;
    v_mission_id UUID;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
        -- 1. Determine next phase
        v_prochaine_phase := CASE NEW.phase
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;

        IF v_prochaine_phase IS NULL THEN
            RETURN NEW;
        END IF;

        -- 2. Team type for next phase
        v_equipe_type := CASE v_prochaine_phase
            WHEN 'mecanique' THEN 'mecanique'::type_equipe
            WHEN 'electrique' THEN 'electrique'::type_equipe
            WHEN 'verification' THEN 'mixte'::type_equipe
        END;

        -- 3. Check for ACTIVE mission only (exclude termine)
        IF EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = NEW.chantier_id
              AND om.phase = v_prochaine_phase
              AND om.statut NOT IN ('termine')
        ) THEN
            RETURN NEW;
        END IF;

        -- 4. Find least-loaded available team (DETERMINISTIC: least loaded + oldest first)
        SELECT e.id, e.nom INTO v_equipe_id, v_equipe_nom
        FROM equipes e
        WHERE e.type = v_equipe_type
          AND e.actif = TRUE
          AND e.id <> NEW.equipe_id
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC,
          e.date_creation ASC
        LIMIT 1;

        -- 5. Create mission (with or without team)
        IF v_equipe_id IS NULL THEN
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_prochaine_phase, 'en_attente', NOW(),
                    'Phase ' || v_prochaine_phase || ' — aucune equipe dispo, assignation manuelle requise')
            RETURNING id INTO v_mission_id;
        ELSE
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_equipe_id;

            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_equipe_id, v_prochaine_phase, 'en_attente', NOW(),
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = v_prochaine_phase),
                    'Declenche auto depuis phase ' || NEW.phase)
            RETURNING id INTO v_mission_id;
        END IF;

        -- 6. Generate checklist
        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_prochaine_phase, generer_checklist(v_prochaine_phase::text));
        END IF;

        -- 7. Record in roadmap
        INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
        VALUES (NEW.chantier_id, v_prochaine_phase, v_equipe_id, 'EN_ATTENTE', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mission_phase_suivante ON ordres_de_mission;
CREATE TRIGGER trg_mission_phase_suivante
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION declencher_phase_suivante();

COMMIT;
