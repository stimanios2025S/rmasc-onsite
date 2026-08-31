-- ============================================================================
-- Fix: Reset all teams stuck in non-DISPONIBLE state
-- with no active missions back to DISPONIBLE
-- ============================================================================

-- 1. Show stuck teams BEFORE fix
SELECT e.id, e.nom, e.type::text, e.statut_equipe::text,
       e.disponible_a_partir_de,
       (SELECT COUNT(*) FROM ordres_de_mission om
        WHERE om.equipe_id = e.id
          AND om.statut IN ('en_attente','en_cours','en_route','en_pause','bloque')) AS active_missions
FROM equipes e
WHERE e.actif = TRUE
  AND (e.statut_equipe::text != 'DISPONIBLE'
       OR e.disponible_a_partir_de > NOW())
ORDER BY e.type, e.nom;

-- 2. Reset teams with NO active missions to DISPONIBLE
UPDATE equipes
SET statut_equipe = 'DISPONIBLE',
    disponible_a_partir_de = NOW(),
    date_modification = NOW()
WHERE actif = TRUE
  AND (statut_equipe::text != 'DISPONIBLE'
       OR disponible_a_partir_de > NOW())
  AND id NOT IN (
    SELECT DISTINCT om.equipe_id
    FROM ordres_de_mission om
    WHERE om.equipe_id IS NOT NULL
      AND om.statut IN ('en_attente','en_cours','en_route','en_pause','bloque')
  );

-- 3. Show teams AFTER fix
SELECT e.id, e.nom, e.type::text, e.statut_equipe::text,
       e.disponible_a_partir_de
FROM equipes e
WHERE e.actif = TRUE
ORDER BY e.type, e.nom;
