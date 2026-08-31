-- ============================================================================
-- CLEANUP: Reset all test data — fresh start across all portals
-- WARNING: This deletes ALL missions, pointages, incidents, material requests
--          Chantiers are kept but reset to 'planifie'
--          Teams are reset to DISPONIBLE
-- ============================================================================

BEGIN;

-- 1. Cancel all active pauses
UPDATE pauses_journee SET date_fin = NOW()
WHERE date_fin IS NULL;

-- 2. Delete all GPS tracking data
DELETE FROM gps_tracking;

-- 3. Delete all pointage journal entries
DELETE FROM journal_pointage_gps;

-- 4. Delete all notifications_retard
DELETE FROM notifications_retard;

-- 5. Delete all blocages
DELETE FROM blocages_et_requisitions;

-- 6. Delete all material requests
DELETE FROM demandes_materiel;

-- 7. Delete all checklists
DELETE FROM checklists_phases;

-- 8. Delete all roadmap entries
DELETE FROM roadmap_chantier;

-- 9. Delete all fichiers
DELETE FROM fichiers_chantier;

-- 10. Delete all missions
DELETE FROM ordres_de_mission;

-- 11. Reset all chantiers to 'planifie' and clear team assignment
UPDATE chantiers
SET statut = 'planifie',
    date_modification = NOW();

-- 12. Reset ALL teams to DISPONIBLE
UPDATE equipes
SET statut_equipe = 'DISPONIBLE',
    disponible_a_partir_de = NOW(),
    date_modification = NOW()
WHERE statut_equipe != 'DISPONIBLE' OR disponible_a_partir_de > NOW();

-- 13. Reset all users to actif
UPDATE utilisateurs SET actif = TRUE WHERE actif = FALSE;

-- 14. Clear demandes_integration (test submissions)
DELETE FROM demandes_integration;

COMMIT;

-- Verify cleanup
SELECT 'Chantiers' AS tbl, COUNT(*) AS remaining FROM chantiers
UNION ALL
SELECT 'Missions', COUNT(*) FROM ordres_de_mission
UNION ALL
SELECT 'Pointages', COUNT(*) FROM journal_pointage_gps
UNION ALL
SELECT 'GPS', COUNT(*) FROM gps_tracking
UNION ALL
SELECT 'Blocages', COUNT(*) FROM blocages_et_requisitions
UNION ALL
SELECT 'Pauses actives', COUNT(*) FROM pauses_journee WHERE date_fin IS NULL
UNION ALL
SELECT 'Matériel', COUNT(*) FROM demandes_materiel
UNION ALL
SELECT 'Retards', COUNT(*) FROM notifications_retard
UNION ALL
SELECT 'Équipes DISPONIBLE', COUNT(*) FROM equipes WHERE statut_equipe = 'DISPONIBLE'
UNION ALL
SELECT 'Équipes EN_MISSION', COUNT(*) FROM equipes WHERE statut_equipe = 'EN_MISSION'
UNION ALL
SELECT 'Équipes EN_REPOS', COUNT(*) FROM equipes WHERE statut_equipe = 'EN_REPOS';
