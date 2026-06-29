-- =============================================================================
-- Event lifecycle audit trail — who/when/why behind a cancellation (H1-3)
--
-- WHY: events.is_cancelled is a bare boolean — it records THAT an event was
-- cancelled but not who pulled it, when, or why. As the events table grows this
-- loses the moderation/host trail we already keep for removal (removed_at +
-- removed_reason). This adds the matching who/when/why for the cancel state,
-- mirroring that existing pattern and the profiles suspended_at/by/reason trio.
--
-- ADDITIVE + NON-BREAKING (Foundation Hardening principle #3): three nullable
-- columns, no change to is_cancelled, no behavioural backfill. is_cancelled
-- stays the source of truth for "is this event cancelled"; these columns
-- annotate it. Every cancel write path is updated (in code) to populate them;
-- reinstate clears them.
--
-- BACKFILL: events has NO updated_at column, so there is no reliable per-row
-- "when" for events cancelled before this migration. We intentionally leave
-- cancelled_at NULL for those rows rather than stamp a fabricated time — a NULL
-- honestly reads as "cancelled before we tracked it". No backfill statement runs.
-- =============================================================================

alter table public.events
  add column if not exists cancelled_at        timestamptz,
  add column if not exists cancelled_by        uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

comment on column public.events.cancelled_at        is 'When the event was cancelled (is_cancelled flipped true). NULL for rows cancelled before H1-3, or live events.';
comment on column public.events.cancelled_by        is 'Profile that cancelled the event (host/manager/moderator). ON DELETE SET NULL so the audit row survives author deletion (H1-5 content-survives-deletion).';
comment on column public.events.cancellation_reason is 'Free-text reason where the cancel path captured one (e.g. staff removal); NULL when no reason was supplied.';

-- Partial index: the operator/moderation views that list cancelled events sort
-- by recency. Cheap — indexes only the (small) cancelled set.
create index if not exists events_cancelled_at_idx
  on public.events (cancelled_at desc)
  where cancelled_at is not null;
