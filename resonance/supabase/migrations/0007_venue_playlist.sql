-- 0007_venue_playlist — ambient auto-DJ lounge (build plan §8, Phase 1).
-- A lounge venue plays an always-on, looping playlist so the room is never dead
-- (the cold-start backstop, BUILD-PLAN §3.1). Stored as an ordered array of
-- media ids; other venue kinds leave it empty.

alter table resonance.venues
  add column if not exists playlist jsonb not null default '[]'::jsonb;
