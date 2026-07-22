-- =============================================================================
-- Shared / co-hosted events: event ↔ space shares (Events EC3, delivers collaborator B2; ADR-800/ADR-802)
--
-- WHAT: an event lives in ONE home space (events.space_id). EC3 lets that same event ALSO appear on
-- OTHER spaces' calendars without moving it — a co-host / featured-elsewhere relationship. An
-- event_space_shares row is a request→approve handshake between the event's host side and a target
-- space's stewards (mirrors event_placement_requests + space_collaborations). When 'accepted', the
-- event surfaces on the target space's calendar + .ics feed IN ADDITION to its home space's.
--
-- TWO ENTRY POINTS, ONE TABLE (see app/(main)/events/share-actions.ts):
--   • the event host INVITES a space   → the target space's stewards approve.
--   • a space steward asks to FEATURE an event → the event's host side approves.
-- Either can AUTO-ACCEPT (steward-of-both, or an accepted space_collaboration already links the two).
--
-- ─── THE LEAK CONTRACT (why this is tenancy-sensitive) ────────────────────────────────────────────
-- A share row grants VISIBILITY of an event on another space's public surfaces. The row alone must
-- NEVER be enough to surface a private event: every reader that unions accepted shares RE-APPLIES the
-- event's OWN visibility gate (published + public/unlisted + non-cancelled + upcoming). So even if a
-- share to space B is 'accepted', a later flip of the event to private/circle_only/draft, or a cancel,
-- removes it from B's feed immediately — the gate is on the EVENT'S OWN ROW in the reader, not on the
-- share's status. The share is a NECESSARY condition, never a SUFFICIENT one. This holds in all three
-- readers: space_public_calendar_feed (below), listSpaceCalendarEvents, and spaceHasPublicUpcomingEvents.
--
-- ACCESS MODEL — RLS ENABLED, NO POLICIES, service-role only (same posture as event_placement_requests
-- + space_collaborations; listed in scripts/rls-deny-all.txt). Every read/write goes through the admin
-- client behind app-layer authz (share-actions.ts gates host side on event.editSettings, space side on
-- the space's steward set). RLS-on-no-policy = fail-closed: anon/authenticated get nothing.
--
-- Reversible: drop table event_space_shares (then re-run the EC1 space_public_calendar_feed body).
-- =============================================================================

create table if not exists public.event_space_shares (
  id                   uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references public.events(id)   on delete cascade,
  space_id             uuid        not null references public.spaces(id)   on delete cascade,
  -- Which space initiated (the event's home space when the host invites; the target space when a
  -- steward asks to feature). Nullable: a platform event has no home space to attribute the invite to.
  invited_by_space_id  uuid        references public.spaces(id)  on delete set null,
  requested_by         uuid        not null references public.profiles(id),
  status               text        not null default 'pending'
                                   check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  responded_by         uuid        references public.profiles(id)
);

-- At most ONE active (pending|accepted) share per (event, space). A resolved (declined|revoked) row is
-- ignored by the partial predicate, so the pair can be re-shared after a decline/revoke.
create unique index if not exists uniq_event_space_share_active
  on public.event_space_shares (event_id, space_id)
  where status in ('pending', 'accepted');

-- Target-space inbox: a space's shares by state (pending to approve, accepted to list).
create index if not exists idx_event_space_share_space_status
  on public.event_space_shares (space_id, status);

-- Covering index for the FK the event-side surfaces + host-side approvals join on.
create index if not exists idx_event_space_share_event_id
  on public.event_space_shares (event_id);

alter table public.event_space_shares enable row level security;
-- No policies by design (see header): access is service-role only, gated in the app layer.


-- ─── space_public_calendar_feed — now UNIONs accepted shares (EC3) ────────────────────────────────
-- Recreate the EC1 per-space feed to ALSO include events accepted-shared TO this space. The owned-events
-- select is unchanged (published/public/unlisted, non-cancelled, upcoming, owning space network+active).
-- The shared select re-applies the EVENT'S OWN redaction gate — published + public/unlisted +
-- non-cancelled + upcoming — so a private/circle_only/draft event never surfaces via a share (the leak
-- contract above). `union` (distinct) dedupes an event that somehow matches both branches. Column list
-- and grant are identical to 20261193000000; the route + in-function posture are unchanged.
create or replace function public.space_public_calendar_feed(_space_id uuid)
returns table (
  id           uuid,
  title        text,
  description  text,
  location     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  slug         text,
  is_cancelled boolean,
  time_zone    text
)
language sql
stable
security definer
set search_path = public
as $$
  -- 1) The space's OWN events (unchanged EC1 body: owning space must be network-visible + active).
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone
  from   public.events e
  join   public.spaces s
         on s.id = e.space_id
        and s.visibility = 'network'
        and s.status = 'active'
  where  e.space_id = _space_id
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'

  union

  -- 2) Events ACCEPTED-shared TO this space (EC3). The share is necessary but NOT sufficient: the
  --    event's OWN visibility gate is re-applied here, so a private/circle_only/draft/cancelled event
  --    never surfaces even with an accepted share.
  select e.id, e.title, e.description, e.location, e.starts_at, e.ends_at,
         e.slug, e.is_cancelled, e.time_zone
  from   public.event_space_shares sh
  join   public.events e on e.id = sh.event_id
  where  sh.space_id = _space_id
    and  sh.status = 'accepted'
    and  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.visibility in ('public', 'unlisted')
    and  e.starts_at >= now() - interval '1 day'

  order by starts_at asc
  limit  200;
$$;

grant execute on function public.space_public_calendar_feed(uuid) to anon, authenticated;

comment on function public.space_public_calendar_feed(uuid) is
  'A space''s upcoming published public/unlisted events for its public subscribable .ics feed (Events EC1, ADR-800) UNIONed with events accepted-shared to it (EC3). Never lists circle_only/private/draft/cancelled: the event''s OWN visibility gate is re-applied in BOTH branches, so an accepted share is necessary but not sufficient. Owning space must be network+active; anon-callable, self-gated in-function.';
