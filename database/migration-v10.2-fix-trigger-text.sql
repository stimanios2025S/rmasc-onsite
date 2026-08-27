-- FIX: Use text everywhere to avoid enum/VARCHAR mismatch
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE
    v_next_phase TEXT;
    v_team_type TEXT;
    v_team_id UUID;
    v_team_nom TEXT;
    v_mission_id UUID;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
        -- 1. Determine next phase
        v_next_phase := CASE OLD.phase::text
            WHEN 'mecanique' THEN 'electrique'
            WHEN 'electrique' THEN 'verification'
            ELSE NULL
        END;

        -- 2. If verification done, mark chantier complete
        IF OLD.phase::text = 'verification' THEN
            UPDATE chantiers SET statut = 'reception_officielle', date_modification = NOW()
            WHERE id = NEW.chantier_id;
            RETURN NEW;
        END IF;

        -- 3. No next phase
        IF v_next_phase IS NULL THEN
            RETURN NEW;
        END IF;

        -- 4. Team type for next phase
        v_team_type := CASE v_next_phase
            WHEN 'mecanique' THEN 'mecanique'
            WHEN 'electrique' THEN 'electrique'
            WHEN 'verification' THEN 'mixte'
        END;

        -- 5. Check for active mission of this phase (skip completed ones)
        IF EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = NEW.chantier_id
              AND om.phase::text = v_next_phase
              AND om.statut != 'termine'
        ) THEN
            RETURN NEW;
        END IF;

        -- 6. Find least-loaded available team
        SELECT e.id, e.nom INTO v_team_id, v_team_nom
        FROM equipes e
        WHERE e.type::text = v_team_type
          AND e.actif = TRUE
          AND e.id <> NEW.equipe_id
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe::text = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC
        LIMIT 1;

        -- 7. Create mission
        IF v_team_id IS NULL THEN
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_next_phase::phase_mission, 'en_attente', NOW(),
                    v_next_phase || ' — aucune equipe dispo')
            RETURNING id INTO v_mission_id;
        ELSE
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_team_id;
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_team_id, v_next_phase::phase_mission, 'en_attente', NOW(),
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase::text = v_next_phase),
                    'Auto from phase ' || OLD.phase)
            RETURNING id INTO v_mission_id;
        END IF;

        -- 8. Checklist
        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_next_phase::phase_mission, generer_checklist(v_next_phase));
        END IF;

        -- 9. Roadmap
        INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
        VALUES (NEW.chantier_id, v_next_phase::phase_mission, v_team_id, 'EN_ATTENTE', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
