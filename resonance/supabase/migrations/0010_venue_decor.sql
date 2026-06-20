-- 0010_venue_decor — venue decoration toolkit (build plan §13, Phase 2).
-- Hosts decorate a venue by placing decor items on a board; the layout is saved
-- as jsonb and rendered as a backdrop. `level` gates how much of the decor
-- palette is unlocked. `created_by` records the host/owner so decor edits can be
-- host-gated; it is nullable because legacy venues predate ownership, and those
-- rows stay null (the API allows edits when created_by is null).

alter table resonance.venues
  add column if not exists decor jsonb not null default '[]'::jsonb;

alter table resonance.venues
  add column if not exists level integer not null default 1;

alter table resonance.venues
  add column if not exists created_by uuid;
