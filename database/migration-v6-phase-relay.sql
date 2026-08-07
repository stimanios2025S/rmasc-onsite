-- ============================================================================
-- RMASC OnSite v6 — RELAIS AUTOMATIQUE DES PHASES
-- Mécanique terminée → Électrique assignée auto → Vérificateur assigné auto
-- ============================================================================
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. FONCTION : Déclencher la phase suivante quand une mission est terminée
--    - Mécanique → Électrique (équipe élec disponible)
--    - Électrique → Vérification (équipe vérif)
--    - Vérification → Chantier réceptionné
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
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        -- 1. Déterminer la prochaine phase
        v_prochaine_phase := CASE NEW.phase
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;

        -- 2. Si c'était la vérification → le chantier est réceptionné
        IF NEW.phase = 'verification' THEN
            UPDATE chantiers SET statut = 'reception_officielle', date_modification = NOW()
            WHERE id = NEW.chantier_id;
            RETURN NEW;
        END IF;

        -- 3. Si pas de prochaine phase → rien
        IF v_prochaine_phase IS NULL THEN
            RETURN NEW;
        END IF;

        -- 4. Type d'équipe pour la prochaine phase
        v_equipe_type := CASE v_prochaine_phase
            WHEN 'mecanique' THEN 'mecanique'::type_equipe
            WHEN 'electrique' THEN 'electrique'::type_equipe
            WHEN 'verification' THEN 'mixte'::type_equipe
        END;

        -- 5. Vérifier qu'une mission de cette phase n'existe pas déjà
        IF EXISTS (SELECT 1 FROM ordres_de_mission om
                   WHERE om.chantier_id = NEW.chantier_id AND om.phase = v_prochaine_phase) THEN
            RETURN NEW;
        END IF;

        -- 6. Trouver l'équipe la MOINS CHARGÉE du bon type (rotation intelligente)
        --    Priorité: DISPONIBLE, puis la moins chargée (même si EN_MISSION)
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

        -- 7. Si aucune équipe dispo → créer la mission SANS équipe (assignation manuelle par admin)
        --    (pas la même équipe qui vient de terminer)
        IF v_equipe_id IS NULL THEN
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_prochaine_phase, 'en_attente', NOW(),
                    'Phase ' || v_prochaine_phase || ' — aucune equipe dispo, assignation manuelle requise')
            RETURNING id INTO v_mission_id;
        ELSE
            -- Marquer l'équipe comme en mission
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_equipe_id;

            -- Créer la mission de la prochaine phase
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_equipe_id, v_prochaine_phase, 'en_attente', NOW(),
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = v_prochaine_phase),
                    'Declenche auto depuis phase ' || NEW.phase)
            RETURNING id INTO v_mission_id;
        END IF;

        -- 8. Générer la checklist de la prochaine phase
        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_prochaine_phase, generer_checklist(v_prochaine_phase::text));
        END IF;

        -- 9. Enregistrer dans la roadmap
        INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
        VALUES (NEW.chantier_id, v_prochaine_phase, v_equipe_id, 'EN_ATTENTE', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. TRIGGER : après mise à jour du statut vers 'termine'
-- ═══════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_mission_phase_suivante ON ordres_de_mission;
CREATE TRIGGER trg_mission_phase_suivante
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION declencher_phase_suivante();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. S'assurer que la fonction repos existe aussi
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        UPDATE equipes SET statut_equipe = 'EN_REPOS', disponible_a_partir_de = NOW() + INTERVAL '3 days'
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

COMMIT;
