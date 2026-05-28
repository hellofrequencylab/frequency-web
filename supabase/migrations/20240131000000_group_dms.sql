-- =====================================================================
-- Migration: Group DM support
-- Adds name + created_by to conversations table. Existing 1:1 DMs
-- continue to work unchanged (name is nullable; renders as
-- participant names client-side when null).
-- =====================================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS name       text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
