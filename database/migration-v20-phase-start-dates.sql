-- ============================================================================
-- Migration v20 — Dates de démarrage prévues par phase (planning admin)
-- L'admin définit une date de démarrage prévue par phase (mécanique,
-- électrique, vérification) à la création du chantier, modifiable après.
--
-- Stockage : chantiers.date_debut_<phase> (planning, jamais de dates réelles).
-- Les missions reprennent la date planifiée comme date_declenchement
-- (informatif uniquement — ne bloque JAMAIS les travailleurs).
-- Les dates réelles (date_debut_effectif / date_fin_effectif) ne sont JAMAIS
-- touchées. Sans planning (NULL, ex: chantiers ERP), le comportement est
-- IDENTIQUE à avant (COALESCE → NOW()).
--
-- 100% idempotent : ré-exécutable sans risque (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

BEGIN;

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS date_debut_mecanique TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_debut_electrique TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_debut_verification TIMESTAMPTZ NULL;

-- Le trigger de relais reprend la date planifiée si elle existe, NOW() sinon.
CREATE OR REPLACE FUNCTION declencher_phase_suivante()
RETURNS TRIGGER AS $$
DECLARE
    v_prochaine_phase phase_mission;
    v_equipe_type type_equipe;
    v_equipe_id UUID;
    v_equipe_nom TEXT;
    v_mission_id UUID;
    v_date_planifiee TIMESTAMPTZ;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine' THEN
        v_prochaine_phase := CASE NEW.phase::text
            WHEN 'mecanique' THEN 'electrique'::phase_mission
            WHEN 'electrique' THEN 'verification'::phase_mission
            ELSE NULL
        END;

        IF v_prochaine_phase IS NULL THEN
            RETURN NEW;
        END;

        v_equipe_type := CASE v_prochaine_phase::text
            WHEN 'mecanique' THEN 'mecanique'::type_equipe
            WHEN 'electrique' THEN 'electrique'::type_equipe
            WHEN 'verification' THEN 'mixte'::type_equipe
        END;

        IF EXISTS (
            SELECT 1 FROM ordres_de_mission om
            WHERE om.chantier_id = NEW.chantier_id
              AND om.phase::text = v_prochaine_phase::text
              AND om.statut NOT IN ('termine')
        ) THEN
            RETURN NEW;
        END IF;

        -- Date planifiée par l'admin pour la phase suivante (NULL = pas de planning)
        SELECT CASE v_prochaine_phase::text
                 WHEN 'electrique' THEN c.date_debut_electrique
                 WHEN 'verification' THEN c.date_debut_verification
                 ELSE NULL
               END
          INTO v_date_planifiee
          FROM chantiers c WHERE c.id = NEW.chantier_id;
        v_date_planifiee := COALESCE(v_date_planifiee, NOW());

        SELECT e.id, e.nom INTO v_equipe_id, v_equipe_nom
        FROM equipes e
        WHERE e.type::text = v_equipe_type::text
          AND e.actif = TRUE
          AND e.id <> NEW.equipe_id
          AND e.disponible_a_partir_de <= NOW()
        ORDER BY
          CASE WHEN e.statut_equipe = 'DISPONIBLE' THEN 0 ELSE 1 END,
          (SELECT COUNT(*) FROM ordres_de_mission om
           WHERE om.equipe_id = e.id AND om.statut IN ('en_cours','en_attente')) ASC,
          e.date_creation ASC
        LIMIT 1;

        IF v_equipe_id IS NULL THEN
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, notes)
            VALUES (NEW.chantier_id, NULL, v_prochaine_phase::text, 'en_attente', v_date_planifiee,
                    'Phase ' || v_prochaine_phase || ' — aucune equipe dispo')
            RETURNING id INTO v_mission_id;
        ELSE
            UPDATE equipes SET statut_equipe = 'EN_MISSION' WHERE id = v_equipe_id;
            INSERT INTO ordres_de_mission (chantier_id, equipe_id, phase, statut, date_declenchement, duree_estimee_jours, notes)
            VALUES (NEW.chantier_id, v_equipe_id, v_prochaine_phase::text, 'en_attente', v_date_planifiee,
                    (SELECT duree_estimee_jours FROM configuration_phases WHERE phase = v_prochaine_phase::text),
                    'Declenche auto depuis phase ' || NEW.phase)
            RETURNING id INTO v_mission_id;
        END IF;

        IF v_mission_id IS NOT NULL THEN
            INSERT INTO checklists_phases (mission_id, phase, etapes)
            VALUES (v_mission_id, v_prochaine_phase::text, generer_checklist(v_prochaine_phase::text));
        END IF;

        INSERT INTO roadmap_chantier (chantier_id, phase, equipe_id, statut, date_debut)
        VALUES (NEW.chantier_id, v_prochaine_phase::text, v_equipe_id, 'EN_ATTENTE', NOW());
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
