-- 0006_venue_theme — themed, browsable venues (build plan §6, Phase 1).
-- A simple theme label for the lobby. Spatial layout/decor (jsonb) arrive in
-- Phase 2; this is just the browse-and-enter metadata.

alter table resonance.venues
  add column if not exists theme text;
