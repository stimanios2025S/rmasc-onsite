-- ============================================================================
-- RMASC OnSite — Nettoyage des données de test
-- Supprime les chantiers/missions/demandes de test créés pendant le développement
-- ============================================================================
BEGIN;

-- Supprimer les demandes de test
DELETE FROM demandes_integration WHERE reference_commande_erp LIKE '%TEST%' OR reference_commande_erp LIKE 'MAN-%';

-- Supprimer les chantiers de test (références de test)
DELETE FROM chantiers WHERE reference_commande_erp LIKE '%TEST%' OR reference_commande_erp LIKE 'MAN-%';

-- Remettre les équipes en DISPONIBLE (sauf si en mission réelle)
UPDATE equipes SET statut_equipe = 'DISPONIBLE', disponible_a_partir_de = NOW()
WHERE NOT EXISTS (SELECT 1 FROM ordres_de_mission om WHERE om.equipe_id = equipes.id AND om.statut IN ('en_cours','en_attente'));

COMMIT;
