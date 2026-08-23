-- ============================================================================
-- RMASC OnSite — NETTOYAGE COMPLET DE PRODUCTION
-- ============================================================================
-- Objectif : Supprimer TOUT l'historique, les ordres, les chantiers,
--            les missions, les pointages, les blocages, les SMS,
--            les demandes, et réinitialiser les équipes.
--            Conserve : schéma, tables, triggers, functions, vues,
--                       utilisateurs (comptes), équipes (structure),
--                       configuration_phases.
--
-- ⚠️  IRREVERSIBLE — Exécuter UNIQUEMENT si vous voulez repartir à zéro
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : SUPPRIMER LES DONNÉES DE TERRAIN (pointages, positions, SMS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Position tracking & GPS
DELETE FROM suivis_position_technicien;
DELETE FROM alertes_zone;

-- Pointages GPS (check-in/out des techniciens)
DELETE FROM journal_pointage_gps;

-- SMS en attente ou envoyés
DELETE FROM sms_outbox;

-- Notifications de retard
DELETE FROM notifications_retard;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 : SUPPRIMER LES BLOCAGES & RÉQUISITIONS
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM blocages_et_requisitions;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 : SUPPRIMER LES CHECKLISTS & ROADMAPS
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM checklists_phases;
DELETE FROM roadmap_chantier;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 : SUPPRIMER LES MISSIONS (ordres de mission)
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM ordres_de_mission;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 : SUPPRIMER LES CHANTIERS & LEURS DÉPENDANCES
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM equipements_chantier;
DELETE FROM fichiers_chantier;
DELETE FROM chantiers;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 6 : SUPPRIMER LES DEMANDES D'INTÉGRATION (ERP → OnSite)
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM demandes_integration;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 7 : RÉINITIALISER LES ÉQUIPES À DISPONIBLE
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE equipes
SET statut_equipe = 'DISPONIBLE',
    disponible_a_partir_de = NOW(),
    date_modification = NOW();

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 8 : NETTOYER LES ÉQUIPEMENTS D'ÉQUIPES (garder la structure)
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM equipements_equipe;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 8b : CORRIGER LES COORDONNÉES PAR DÉFAUT (France → Algérie)
-- ═══════════════════════════════════════════════════════════════════════════

-- Fix demandes_integration defaults from Lyon France to Algiers Algeria
ALTER TABLE demandes_integration
  ALTER COLUMN latitude SET DEFAULT 36.7535,
  ALTER COLUMN longitude SET DEFAULT 3.0588;

-- Rendre coordonnees nullable (permettre chantiers sans GPS)
ALTER TABLE chantiers ALTER COLUMN coordonnees DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ÉTAPE 9 : VÉRIFICATION FINALE
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_chantiers INT; v_missions INT; v_blocages INT; v_pointages INT;
    v_demandes INT; v_sms INT; v_equipes INT; v_users INT;
BEGIN
    SELECT COUNT(*) INTO v_chantiers FROM chantiers;
    SELECT COUNT(*) INTO v_missions FROM ordres_de_mission;
    SELECT COUNT(*) INTO v_blocages FROM blocages_et_requisitions;
    SELECT COUNT(*) INTO v_pointages FROM journal_pointage_gps;
    SELECT COUNT(*) INTO v_demandes FROM demandes_integration;
    SELECT COUNT(*) INTO v_sms FROM sms_outbox;
    SELECT COUNT(*) INTO v_equipes FROM equipes;
    SELECT COUNT(*) INTO v_users FROM utilisateurs;

    RAISE NOTICE '════════════════════════════════════════════';
    RAISE NOTICE '  NETTOYAGE TERMINÉ — RÉSUMÉ';
    RAISE NOTICE '════════════════════════════════════════════';
    RAISE NOTICE '  Chantiers restants :    % (devrait être 0)', v_chantiers;
    RAISE NOTICE '  Missions restantes :    % (devrait être 0)', v_missions;
    RAISE NOTICE '  Blocages restants :     % (devrait être 0)', v_blocages;
    RAISE NOTICE '  Pointages restants :    % (devrait être 0)', v_pointages;
    RAISE NOTICE '  Demandes restantes :    % (devrait être 0)', v_demandes;
    RAISE NOTICE '  SMS en file :           % (devrait être 0)', v_sms;
    RAISE NOTICE '  Équipes conservées :    %', v_equipes;
    RAISE NOTICE '  Utilisateurs conservés : %', v_users;
    RAISE NOTICE '════════════════════════════════════════════';
END $$;

COMMIT;

-- ============================================================================
-- NETTOYAGE TERMINÉ
-- La plateforme est prête pour de nouvelles données de production.
-- Les comptes utilisateurs, les équipes, et la configuration sont conservés.
-- ============================================================================
