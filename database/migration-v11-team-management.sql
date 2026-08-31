-- ============================================================================
-- Migration v11 — Team Management: configurable rest days + team settings
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLE : parametres_systeme — config globale modifiable par l'admin
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parametres_systeme (
    cle VARCHAR(50) PRIMARY KEY,
    valeur TEXT NOT NULL,
    description TEXT,
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valeurs par défaut
INSERT INTO parametres_systeme (cle, valeur, description) VALUES
    ('jours_repos', '3', 'Nombre de jours de repos obligatoire après une mission terminée')
ON CONFLICT (cle) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TRIGGER : repos configurable (au lieu de INTERVAL '3 days' hardcodé)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION appliquer_repos_equipe()
RETURNS TRIGGER AS $$
DECLARE
    v_jours TEXT;
    v_interval INTERVAL;
BEGIN
    IF NEW.statut = 'termine' AND OLD.statut != 'termine' THEN
        -- Lire la config depuis parametres_systeme
        SELECT valeur INTO v_jours FROM parametres_systeme WHERE cle = 'jours_repos';
        IF v_jours IS NULL OR v_jours = '' THEN v_jours := '3'; END IF;
        v_interval := (v_jours || ' days')::INTERVAL;

        UPDATE equipes
        SET statut_equipe = 'EN_REPOS',
            disponible_a_partir_de = NOW() + v_interval
        WHERE id = NEW.equipe_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recréer le trigger (il peut déjà exister)
DROP TRIGGER IF EXISTS trg_repos_equipe ON ordres_de_mission;
CREATE TRIGGER trg_repos_equipe
    AFTER UPDATE OF statut ON ordres_de_mission
    FOR EACH ROW WHEN (NEW.statut = 'termine' AND (OLD.statut IS DISTINCT FROM 'termine'))
    EXECUTE FUNCTION appliquer_repos_equipe();

COMMIT;
