-- ============================================================================
-- RMASC OnSite v22 — SORTIE AUTO GPS (pointage unique + détection de sortie)
-- Le worker pointe UNE fois (arrivée). Si le GPS montre qu'il quitte le site
-- sans pause déclarée, un départ "auto_gps" est enregistré et il doit repointer.
-- ============================================================================

-- 1. Colonne source sur le journal GPS (manuel vs auto_gps)
ALTER TABLE journal_pointage_gps ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manuel';

-- 2. Index pour la garde anti-doublon (dernière entrée par mission)
CREATE INDEX IF NOT EXISTS idx_journal_mission_recent
  ON journal_pointage_gps (ordre_mission_id, horodatage DESC);
