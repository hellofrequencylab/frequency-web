-- =============================================================================
-- Poster events engine — capture a poster, AI builds a draft, publish for Zaps,
-- the organizer claims it. Plus a deterministic anti-spam honesty metric.
-- (See docs/EVENTS-SYSTEM.md + the poster-events feature spec.)
--
-- Purely ADDITIVE + IDEMPOTENT. Extends the existing Events system:
--   • a draft → published lifecycle (events.status) layered ON TOP of the
--     existing visibility model. A draft is owner-private regardless of
--     visibility; publishing flips status and (for posted town events) sets
--     visibility='public' so the existing discovery RLS surfaces it.
--   • poster provenance (posted_by_profile_id, poster_path, source).
--   • a claim handshake (claim_token, claimed_at, organizer_name/contact) so an
--     organizer can take over an event a member captured from their poster.
--   • a removal/clawback trail (removed_at, removed_reason) — removing a posted
--     event reverses the poster's Zaps, which is what makes spam unprofitable.
--
-- SCOPE MODELING (important):
--   events.scope_type is free text today (no CHECK constraint) and is 'circle'
--   for normal events. A POSTED TOWN EVENT is not tied to a circle, so it uses
--   scope_type='public' with scope_id = the poster's nexus_region id (fallback:
--   a stable sentinel/global region). Access control still rides on the existing
--   events.visibility column (public | unlisted | circle_only | private) and its
--   visibility-aware SELECT policy — a published posted event is visibility=
--   'public', so it is already discoverable. The only NEW rule RLS needs is:
--   a DRAFT (status='draft') must stay owner-only even if its visibility is
--   'public'. That is the single disjunct we add below.
-- =============================================================================

-- ── 1. events: lifecycle + poster + claim + removal columns ──────────────────
alter table public.events
  add column if not exists status                 text        not null default 'published',
  add column if not exists published_at           timestamptz,
  add column if not exists posted_by_profile_id   uuid        references public.profiles (id) on delete set null,
  add column if not exists poster_path            text,
  add column if not exists source                 text        not null default 'manual',
  add column if not exists domain_id              uuid        references public.pillars (id) on delete set null,
  add column if not exists claim_token            text,
  add column if not exists claimed_at             timestamptz,
  add column if not exists organizer_name         text,
  add column if not exists organizer_contact      text,
  add column if not exists removed_at             timestamptz,
  add column if not exists removed_reason         text;

-- status: a draft is a private work-in-progress; published is live.
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published'));

-- source: how the event entered the system.
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source in ('manual', 'poster_scan'));

-- A posted town event is not tied to a circle: relax scope_type to allow
-- 'public'. scope_type is free text today (no constraint existed), so this only
-- DOCUMENTS the allowed set without breaking circle/region/cluster events.
alter table public.events drop constraint if exists events_scope_type_check;
alter table public.events add constraint events_scope_type_check
  check (scope_type in ('circle', 'group', 'cluster', 'region', 'public'));

-- claim_token is a one-time handshake secret: at most one live event per token.
create unique index if not exists events_claim_token_uniq
  on public.events (claim_token)
  where claim_token is not null;

create index if not exists idx_events_status_starts_at
  on public.events (status, starts_at);
create index if not exists idx_events_posted_by
  on public.events (posted_by_profile_id);

comment on column public.events.status is
  'draft | published. A draft is owner-private (RLS) regardless of visibility; publishing makes it live.';
comment on column public.events.source is
  'manual | poster_scan. poster_scan marks an event captured from a town poster via the AI scan.';
comment on column public.events.posted_by_profile_id is
  'The member who captured/posted the event. Distinct from host_id (the organizer). For a posted-on-behalf event host_id stays null until claimed.';
comment on column public.events.claim_token is
  'One-time url-safe secret. An organizer claims a posted event by presenting this; cleared on claim.';

-- ── 2. RLS: keep drafts owner-private ────────────────────────────────────────
-- The existing "events: visibility-aware read" policy (20260612000000) already
-- makes visibility='public'/'unlisted' events readable by anyone and circle_only
-- events readable by scope members. We REPLACE it with a status-aware version:
--   • A DRAFT (status='draft') is readable ONLY by its poster (posted_by_profile_id),
--     its host (host_id), or staff (guide+). Drafts never leak via 'public'
--     visibility.
--   • A PUBLISHED event keeps the exact prior visibility rules.
-- Discovery of published public-scope posted events is gated to signed-in members
-- at the app layer (server reads filter status='published'); RLS keeps 'public'
-- broadly readable to preserve existing public discover RPCs.
drop policy if exists "events: visibility-aware read" on public.events;
drop policy if exists "events: status + visibility-aware read" on public.events;

create policy "events: status + visibility-aware read"
  on public.events for select
  using (
    case
      when status = 'draft' then (
        posted_by_profile_id = get_my_profile_id()
        or host_id = get_my_profile_id()
        or get_my_role() >= 'guide'::community_role
      )
      else (
        visibility = 'public'
        or visibility = 'unlisted'
        or host_id = get_my_profile_id()
        or posted_by_profile_id = get_my_profile_id()
        or (
          visibility = 'circle_only'
          and get_my_role() >= 'crew'::community_role
          and (
            (scope_type = 'circle' and scope_id = any (get_my_circle_ids()))
            or (scope_type = 'region' and scope_id = get_my_region_id())
          )
        )
      )
    end
  );

comment on policy "events: status + visibility-aware read" on public.events is
  'Drafts are owner-only (poster/host/staff). Published events keep the prior visibility model: public/unlisted readable by anyone, circle_only by scope crew+, plus the poster/host always see their own. Claim/transfer happens through the service-role admin client.';

-- A poster may update their OWN draft (owner-scoped write). Publish, claim and
-- removal all go through the service-role admin client, so no broad update
-- policy is needed for those.
drop policy if exists "events: poster updates own draft" on public.events;
create policy "events: poster updates own draft"
  on public.events for update
  using (
    status = 'draft'
    and posted_by_profile_id = get_my_profile_id()
  )
  with check (
    posted_by_profile_id = get_my_profile_id()
  );

-- ── 3. zap_config: poster-event reward rows ──────────────────────────────────
-- event_posted: publishing a town event you captured from a poster (daily_cap 3
-- so the firehose is bounded even before the honesty multiplier kicks in).
-- event_claim_bonus: paid to the POSTER when an organizer claims their event.
insert into public.zap_config (action_type, zaps_amount, daily_cap, description) values
  ('event_posted',      20, 3,    'Publish a town event you captured from a poster.'),
  ('event_claim_bonus', 30, null, 'Bonus when an organizer claims an event you posted.')
on conflict (action_type) do nothing;
