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

-- v21 : quand la vérification se termine, le chantier passe en réception
-- officielle (il quitte la grille des actifs). Idempotent.
CREATE OR REPLACE FUNCTION passer_chantier_reception()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statut = 'termine' AND OLD.statut IS DISTINCT FROM 'termine'
     AND NEW.phase::text = 'verification' THEN
    UPDATE chantiers SET statut = 'reception_officielle', date_modification = NOW()
    WHERE id = NEW.chantier_id AND statut NOT IN ('reception_officielle', 'termine');
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chantier_reception'
  ) THEN
    CREATE TRIGGER trg_chantier_reception
      AFTER UPDATE OF statut ON ordres_de_mission
      FOR EACH ROW EXECUTE FUNCTION passer_chantier_reception();
  END IF;
END
$$;
