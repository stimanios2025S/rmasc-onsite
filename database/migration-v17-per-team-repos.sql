-- Migration v17: Per-team rest days (jours_repos)
-- Run: sudo -u postgres psql -d rmasc_onsite -f database/migration-v17-per-team-repos.sql

-- 1. Add jours_repos column to equipes (NULL = use global config)
ALTER TABLE equipes ADD COLUMN IF NOT EXISTS jours_repos INTEGER DEFAULT NULL;

-- 2. Update the repos trigger to use per-team jours_repos (falls back to global config)
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
DECLARE
    v_jours INTEGER;
    v_interval INTERVAL;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        -- Use per-team jours_repos if set, otherwise fallback to global config
        SELECT e.jours_repos INTO v_jours FROM equipes e WHERE e.id = NEW.equipe_id;
        IF v_jours IS NULL OR v_jours <= 0 THEN
            SELECT COALESCE(valeur::INTEGER, 3) INTO v_jours FROM parametres_systeme WHERE cle = 'jours_repos';
        END IF;
        IF v_jours IS NULL OR v_jours <= 0 THEN v_jours := 3; END IF;
        v_interval := (v_jours || ' days')::INTERVAL;

        UPDATE equipes
        SET statut_equipe = 'EN_REPOS',
            disponible_a_partir_de = NOW() + v_interval
        WHERE id = NEW.equipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
