-- =============================================================================
-- Poster events: rich flexible `details` harvest.
--
-- A town poster carries far more than the primary event columns: a lineup,
-- set times, ticket tiers, features, links, sponsors, croppable image regions,
-- and a long tail of odds and ends ("21+", "dress code: all white"). The AI
-- scan harvests all of it into one flexible JSON shape (lib/events/types.ts
-- EventDetails); we persist it here without adding a column per field.
--
-- Purely ADDITIVE + IDEMPOTENT. The primary columns stay the source of truth for
-- the event; `details` is supplementary, all-optional, and defaults to an empty
-- object so existing rows and the existing write paths are unaffected.
-- =============================================================================

alter table public.events
  add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.events.details is
  'Rich, flexible poster harvest (lib/events/types.ts EventDetails): lineup, schedule, features, tickets, links, sponsors, imageRegions, other. All optional. The primary event columns remain authoritative; details is supplementary. Defaults to {}.';
