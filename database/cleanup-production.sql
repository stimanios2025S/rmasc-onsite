-- ============================================================================
-- RMASC OnSite — Nettoyage complet pour production réelle
-- Supprime TOUTES les données de test/demo, garde uniquement les référentiels
-- ============================================================================
BEGIN;

-- 1. Supprimer les données de suivi/alertes
DELETE FROM suivis_position_technicien;
DELETE FROM alertes_zone;
DELETE FROM notifications_retard;

-- 2. Supprimer les pointages de test
DELETE FROM journal_pointage_gps;

-- 3. Supprimer les blocages de test
DELETE FROM blocages_et_requisitions;

-- 4. Supprimer les checklists
DELETE FROM checklists_phases;

-- 5. Supprimer les missions
DELETE FROM ordres_de_mission;

-- 6. Supprimer les chantiers de test (références TEST, MAN-, SYNC)
DELETE FROM chantiers
WHERE reference_commande_erp LIKE '%TEST%'
   OR reference_commande_erp LIKE 'MAN-%'
   OR reference_commande_erp LIKE 'SYNC-%'
   OR reference_commande_erp LIKE 'ERP-2026-07-%';

-- 7. Supprimer les demandes d'intégration de test
DELETE FROM demandes_integration
WHERE reference_commande_erp LIKE '%TEST%'
   OR reference_commande_erp LIKE 'MAN-%'
   OR reference_commande_erp LIKE 'SYNC-%';

-- 8. Réinitialiser toutes les équipes à DISPONIBLE
UPDATE equipes SET statut_equipe = 'DISPONIBLE', disponible_a_partir_de = NOW();

-- 9. Garder uniquement les comptes réels (elghani + 21 équipes)
DELETE FROM utilisateurs WHERE identifiant IN (
  'admin','jdupont','mmartin','plefevre','sbernard',
  'meca1','meca2','meca3','meca4','meca5',
  'elec1','elec2','elec3','elec4','elec5',
  'verif1','verif2','verif3','verif4','verif5'
);

COMMIT;
