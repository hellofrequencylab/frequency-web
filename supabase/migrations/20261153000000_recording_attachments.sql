-- Airwaves P0 — recording_attachments: the polymorphic attach (ADR-608, proposed).
--
-- One Recording attaches to MANY hosts (requirement #3): a Space, a Journey, a Journey item (lesson
-- block), a Practice, an Event, or a Product. This is the deliberate refinement of the strategy doc's
-- inline journey_id / journey_item_id columns into a many-to-many polymorphic join, keyed by
-- host_kind + host_id exactly like listing_comments (target_kind + target_id). Each attach may
-- OVERRIDE the recording's price / required_entitlement (null = inherit the recording's own). A Show
-- link is NOT here (show_id stays inline on recordings — a Recording is an Episode in <=1 Show).
--
-- SCOPE + RLS: SERVICE-ROLE ONLY — RLS enabled with NO client policy. The gate is inherited through
-- recording_id (the app layer resolves the parent recording's visibility + is_space_member before
-- surfacing an attach). Added to scripts/rls-deny-all.txt so check:rls records the deny-all posture.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. Untyped-seam (ADR-246) until types
-- regen. No em / en dashes in any surfaced copy; nothing here is member-visible.

create table if not exists public.recording_attachments (
  id                   uuid primary key default gen_random_uuid(),
  recording_id         uuid not null references public.recordings(id) on delete cascade,
  host_kind            text not null
                         check (host_kind in ('space', 'journey', 'journey_item', 'practice', 'event', 'product')),
  host_id              uuid not null,                              -- the host row's id (polymorphic, no FK)
  price                jsonb,                                      -- OPTIONAL per-attach Price override; null = inherit
  required_entitlement text,                                       -- OPTIONAL per-attach gate override; null = inherit
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  -- One Recording attaches to a given host at most once (the attach key).
  unique (recording_id, host_kind, host_id)
);

-- Reverse lookup: "which recordings hang off THIS host" (listAttachmentsFor), ordered.
create index if not exists recording_attachments_host_idx
  on public.recording_attachments (host_kind, host_id, sort_order);

alter table public.recording_attachments enable row level security;
-- No policies: service-role only. The gate is inherited via recording_id in the app layer
-- (lib/airwaves/*). Added to scripts/rls-deny-all.txt (deliberate deny-all).

comment on table public.recording_attachments is
  'Airwaves polymorphic attach (ADR-608): one Recording -> many hosts (space|journey|journey_item| '
  'practice|event|product), keyed by host_kind + host_id like listing_comments. price / '
  'required_entitlement are optional per-attach overrides (null = inherit the recording). Service-role '
  'only (RLS on, no policy; deny-all allowlisted); gate inherited via recording_id in lib/airwaves/*. '
  'See docs/MEDIA-PLATFORM-PLAN.md §5b.';

-- ROLLBACK: drop table if exists public.recording_attachments;
