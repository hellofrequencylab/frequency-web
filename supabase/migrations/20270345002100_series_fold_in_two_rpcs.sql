-- LIVE-206 (ADR-1228): the two counts computed INSIDE Postgres learn what a series is.
--
-- LIVE-198 folded every TypeScript count site so a weekly series reads as ONE gathering rather
-- than nine dates (countSeries / collapseSeriesRows over parent_event_id ?? id). Two counts could
-- not be reached from TypeScript because they are computed in SQL and their RPCs return no
-- parent_event_id to fold on:
--
--   1. circle_momentum.upcoming_events — the Circle's "Upcoming events" vital sign. Folded HERE,
--      in SQL, with count(distinct coalesce(parent_event_id, id)); same signature, same return
--      type, so `create or replace` is enough and the authenticated grant is untouched. The body
--      is the PRIVACY-GATED one from 20270227000000 (see the note at §1).
--   2. public_events — the anon discovery listing behind /discover/* and the marketing "Events
--      soon" strip. A LIST, so it is not folded in SQL: the fold belongs to the reader
--      (lib/discover.ts getPublicEvents, collapseSeriesRows), which is the one place every other
--      list surface folds. What the RPC gains is the two columns that fold needs. A `returns
--      table` cannot change under `create or replace`, so this is DROP + CREATE with the gate body
--      copied VERBATIM from 20270124000000_public_events_narrow.sql (ADR-903) and the grants
--      re-applied in the same transaction. Nothing about who can see which row changes.
--
-- Before this is applied the TypeScript readers see no parent_event_id, seriesKey() falls back to
-- the row id, and the fold is a no-op — exactly today's behaviour. Safe to re-run.
--
-- ROLLBACK (manual): re-run 20270227000000_circle_privacy.sql §circle_momentum and
-- 20270124000000_public_events_narrow.sql §1.

-- ── 1. circle_momentum: count gatherings, not dates ─────────────────────────────────────────
-- 🔴 THE BODY BELOW IS 20270227000000_circle_privacy.sql's, NOT 20260609100000's. The privacy
-- migration re-gated this function behind private.can_enter_circle (a non-member gets NO row, not
-- zeros) and widened search_path to reach `private`; the first draft of this file was written from
-- a case-sensitive grep that missed its upper-case CREATE OR REPLACE and re-created the ungated
-- 2026-06 body, which supabase/tests/circle_privacy.test.sql caught in CI (tests 16 and 21). The only
-- change against the privacy body is the last column's count expression.
CREATE OR REPLACE FUNCTION public.circle_momentum(_circle uuid)
RETURNS TABLE(members integer, new_members_7d integer, new_ties_7d integer, upcoming_events integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  with visible as (
    select c.id
    from public.circles c
    where c.id = _circle
      and private.can_enter_circle(c.id, c.access, c.space_id, c.host_id)
  ),
  mem as (
    select profile_id from public.memberships
    where circle_id = (select id from visible) and status = 'active'
  )
  select
    (select count(*) from mem)::int,
    (select count(*) from public.memberships where circle_id = (select id from visible) and status = 'active' and joined_at > now() - interval '7 days')::int,
    (select count(*) from public.friendships f
       where f.status = 'accepted' and f.responded_at > now() - interval '7 days'
         and f.user_a_id in (select profile_id from mem) and f.user_b_id in (select profile_id from mem))::int,
    -- One per SERIES (LIVE-206): a weekly class with nine dates ahead is one upcoming event here,
    -- the same answer every TypeScript count site gives since LIVE-198.
    (select count(distinct coalesce(e.parent_event_id, e.id)) from public.events e
       where e.scope_id = (select id from visible) and e.starts_at > now() and coalesce(e.is_cancelled, false) = false)::int
  from visible;
$$;

GRANT EXECUTE ON FUNCTION public.circle_momentum(uuid) TO authenticated;

comment on function public.circle_momentum is
  'A circle''s vital signs for a viewer who may ENTER it (no row otherwise, 20270227000000): members, new members (7d), new ties between members (7d), and upcoming events counted per SERIES rather than per date (LIVE-206). Aggregate counts only (ADR-186, P6).';

-- ── 2. public_events: carry the series columns so the reader can fold ─────────────────────
drop function if exists public.public_events(integer);

create function public.public_events(_limit integer default 50)
returns table (
  id               uuid,
  slug             text,
  title            text,
  description      text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  city             text,
  circle_id        uuid,
  circle_name      text,
  price_cents      integer,
  parent_event_id  uuid,
  recurrence_type  text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         c.city, c.id, c.name, e.price_cents,
         e.parent_event_id, e.recurrence_type
  from   public.events e
  -- 🔴 LEFT, always. A standalone event has no circle (ADR-254) and must still list.
  left join public.circles c
         on e.scope_type = 'circle' and e.scope_id = c.id
  where  e.is_cancelled = false
    and  e.starts_at >= now()
    -- (1) a draft is owner-private regardless of visibility (20260613130000).
    and  coalesce(e.status, 'published') = 'published'
    -- (2) staff removal must reach the anon surface.
    and  e.removed_at is null
    -- (3) PUBLIC ONLY. This is a listing, and 'unlisted' is a link (ADR-202).
    --     Never circle_only, never private.
    and  e.visibility = 'public'
    -- (4) a definer bypasses can_view_space_content; re-apply the Space wall.
    and  (e.space_id is null
          or exists (select 1 from public.spaces s
                     where s.id = e.space_id
                       and s.visibility = 'network'
                       and s.status = 'active'))
    -- (5) discovery/crawl reads hard-exclude demo content.
    and  e.is_demo = false
  order by e.starts_at asc
  limit  greatest(1, least(_limit, 200));
$$;

-- Revoked BY NAME as well as from public (ADR-959: `from public` alone removes nothing Supabase's
-- default privileges granted), then granted back to exactly the roles the original carried.
revoke execute on function public.public_events(integer) from public, anon, authenticated;
grant execute on function public.public_events(integer) to anon, authenticated, service_role;

comment on function public.public_events(integer) is
  'Upcoming PUBLISHED, PUBLIC, non-removed, non-demo events on a network-visible active Space (or no Space), for the anon /discover listings and the marketing splash strips (narrowed by ADR-903). City only, never the venue. Never draft, removed, unlisted, circle_only, private or demo. The join to circles stays LEFT so standalone events (ADR-254) still list. Carries parent_event_id + recurrence_type so the reader folds a series to one gathering (LIVE-206); the RPC itself still returns every date.';
