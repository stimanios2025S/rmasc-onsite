-- Migration v16: Add 'annule' to statut_blocage enum for blockage cancellation
-- Run: psql -U rmasc -d rmasc_onsite -f migration-v16-add-annule-statut.sql

-- Add 'annule' to the statut_blocage enum
ALTER TYPE statut_blocage ADD VALUE IF NOT EXISTS 'annule' AFTER 'resolu';
