-- ============================================================================
-- Migration v20 — Dates de démarrage prévues par phase (planning admin)
-- L'admin définit une date de démarrage prévue par phase (mécanique,
-- électrique, vérification) à la création du chantier, modifiable après.
--
-- Ce fichier ne fait QUE les colonnes (infaillible, idempotent).
-- La mise à jour du trigger de relais est faite par l'auto-migration
-- backend au démarrage (non bloquante : l'ancien trigger reste actif
-- en cas d'échec, avec NOW() comme avant).
-- ============================================================================

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS date_debut_mecanique TIMESTAMPTZ NULL;

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS date_debut_electrique TIMESTAMPTZ NULL;

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS date_debut_verification TIMESTAMPTZ NULL;
