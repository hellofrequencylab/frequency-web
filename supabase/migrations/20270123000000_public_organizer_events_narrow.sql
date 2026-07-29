-- =============================================================================
-- A crawlable listing is public-only: the two organizer RPCs re-cut their gate
-- (ADR-899)
-- =============================================================================
-- Purely ADDITIVE + IDEMPOTENT. NARROWING ONLY — nothing here widens any read.
--
-- WHY THESE TWO WERE STALE. Both functions were written in 20260613120000, the
-- migration immediately BEFORE 20260613130000 added `events.status` and
-- `events.removed_at`. The gate predates the draft/removal lifecycle by one file
-- and was never revisited. Stale, not careless — which is also why the sibling
-- in the same file carries the identical holes.
--
-- Both are `security definer` and granted to `anon`, so RLS on `events` does NOT
-- run inside them: these predicates are 100% of the gate. Both feed surfaces a
-- crawler sees — the organizer page (self-canonical, revalidate 3600, emits
-- Person + Event JSON-LD) and app/sitemap.ts, which submits its URLs.
--
-- Four gates were missing on BOTH functions:
--   1. status — a DRAFT event with visibility 'public' was returned to anon and
--      emitted as Event structured data. 20260613130000 is explicit that a draft
--      stays owner-only "even if its visibility is 'public'". Every other anon
--      event read gates it (public_calendar_feed 20261196000000, and
--      space_public_calendar_feed 20270122000000 in both branches).
--   2. removed_at — a staff-REMOVED event kept returning. Today removeEvent
--      (lib/events/event-drafts.ts) also sets is_cancelled, so `is_cancelled =
--      false` masks this in practice; the gate is defence in depth against the
--      next removal path that does not, on the one surface a search engine keeps.
--   3. unlisted — 'unlisted' is LINK-ONLY (ADR-202), so it has no place on a
--      crawlable, sitemap-enumerated listing. Same call public_calendar_feed made
--      (20261196000000) and the same gate the sitemap's own event reader already
--      ships (lib/events/series-seo.ts uses `visibility = 'public'`, singular).
--      The event stays fully reachable by its own link and on its Space's .ics.
--   4. space_id — a public event owned by a private/suspended Space was crawlable
--      through its host: a definer bypasses the RESTRICTIVE can_view_space_content
--      policy (20260711090000). Same idiom as public_calendar_feed. Platform
--      events (space_id null) pass; a Space's events pass only while it is
--      network + active. Legacy rows are trigger-stamped to ROOT
--      (20260712030000), which is network + active, so they pass unchanged.
--
-- Plus is_demo on BOTH the event and the host profile. The convention splits: the
-- in-app feeds follow the operator's `demo_mode` switch, while the one DISCOVERY
-- read (circles_near, 20260603000006) hard-excludes. These two follow
-- circles_near, because this is the only anon event RPC emitting Event + Person
-- JSON-LD into a search index and seeded fictional events and people must never
-- be published there as real structured data. (demo_mode has defaulted OFF since
-- 20260817000000, so the real-world row delta is ~0 either way.)
--
-- OUT COLUMNS ARE UNCHANGED on both functions — same names, same order, same
-- types — so `create or replace` cannot raise 42P13 (the error that bit this repo
-- on 2026-07-26 is triggered only by a changed return type) and
-- lib/database.types.ts needs no regeneration. No drop, so the anon grant is
-- never rewritten; it is re-issued anyway so a fresh replay is self-contained.
--
-- 🔴 EVERY event predicate stays inside the LEFT JOIN's ON clause. The organizer
-- page returns null → notFound() on an empty row set, and relies on the HOST-ONLY
-- row to render "nothing on the public calendar right now". One predicate moved to
-- the outer WHERE turns this into an inner join and 404s every host with nothing
-- public — a security narrowing becoming an availability regression. Pinned by
-- test/contract/public-organizer-rpc-gate.test.ts.
--
-- Reversible: re-run the two bodies from 20260613120000_event_calendar_follows.sql.
-- See docs/DECISIONS.md ADR-899.
-- =============================================================================

-- ── 1. public_organizer_events — a host's crawlable event list ───────────────
create or replace function public.public_organizer_events(_handle text)
returns table (
  host_id           uuid,
  host_display_name text,
  host_handle       text,
  host_avatar_url   text,
  id                uuid,
  slug              text,
  title             text,
  description       text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  city              text,
  circle_id         uuid,
  circle_name       text,
  is_past           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
    c.city, c.id, c.name,
    (coalesce(e.ends_at, e.starts_at) < now()) as is_past
  from   public.profiles p
  left join public.events e
         on e.host_id = p.id
        and e.is_cancelled = false
        -- (1) a draft is owner-private regardless of visibility (20260613130000).
        and coalesce(e.status, 'published') = 'published'
        -- (2) staff removal must reach the indexed surface.
        and e.removed_at is null
        -- (3) PUBLIC ONLY. 'unlisted' is link-only (ADR-202) and this page is
        --     crawlable and sitemap-enumerated. Never circle_only/private.
        and e.visibility = 'public'
        -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
        --     Correlated EXISTS, not a chained join: it references only `e`, so it
        --     lives in this ON clause and the LEFT JOIN shape is preserved.
        and (e.space_id is null
             or exists (select 1 from public.spaces s
                        where s.id = e.space_id
                          and s.visibility = 'network'
                          and s.status = 'active'))
        -- discovery/crawl reads hard-exclude demo content.
        and e.is_demo = false
        -- Keep the past tail finite; far-back events aren't worth crawling.
        and coalesce(e.ends_at, e.starts_at) >= now() - interval '180 days'
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  p.handle = _handle
    and  p.is_demo = false
  order by is_past asc, e.starts_at asc
  limit  100;
$$;

grant execute on function public.public_organizer_events(text) to anon, authenticated;

comment on function public.public_organizer_events(text) is
  'A host''s PUBLISHED, PUBLIC, non-removed events (upcoming + 180d past) for the crawlable organizer profile (Events B-4, narrowed by ADR-899). City only, never the venue. Never draft, removed, unlisted, circle_only, private, demo, or owned by a non-network/inactive Space. Every event predicate lives in the LEFT JOIN ON clause so the host-only row still returns when nothing qualifies.';


-- ── 2. public_organizer_handles — hosts with crawlable events (the sitemap) ──
-- Same gate, so the sitemap never advertises an organizer URL that renders empty.
-- A divergent gate here would manufacture soft-404s: the page would correctly show
-- its empty state on a URL a crawler was explicitly pointed at. INNER JOIN, so
-- these predicates may live in WHERE — the host-only-row rule above does not apply.
create or replace function public.public_organizer_handles(_limit integer DEFAULT 500)
returns table (
  handle      text,
  next_starts timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.handle, min(e.starts_at) as next_starts
  from   public.events e
  join   public.profiles p on p.id = e.host_id
  where  e.is_cancelled = false
    and  coalesce(e.status, 'published') = 'published'
    and  e.removed_at is null
    and  e.visibility = 'public'
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    and  e.is_demo = false
    and  e.starts_at >= now()
    and  p.handle is not null
    and  p.is_demo = false
  group by p.handle
  order by next_starts asc
  limit  greatest(1, least(_limit, 1000));
$$;

grant execute on function public.public_organizer_handles(integer) to anon, authenticated;

comment on function public.public_organizer_handles(integer) is
  'Handles of hosts with at least one upcoming PUBLISHED, PUBLIC, non-removed, non-demo event on a network-visible active Space (or no Space), for the sitemap organizer URLs (Events B-4, narrowed by ADR-899). Same gate as public_organizer_events, so the sitemap never advertises a page that renders empty.';
