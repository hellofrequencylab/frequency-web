-- GEO-city-events (owner ruling 2026-10-14): a standalone public event lists under its own city.
--
-- public.public_events is the anon listing behind /discover/events, /discover/places and the
-- density-gated city pages at /discover/cities/<slug> (app/discover/cities/_data.ts filters its
-- rows by citySlug(row.city)). Its `city` column was `c.city` ONLY, read through the LEFT join to
-- circles. A standalone event (no Circle, ADR-254) therefore came back with city = null, and every
-- city surface dropped it, even though the event carries its own city.
--
-- THE ONE CHANGE: city = the Circle's city when the event has a Circle with a non-blank city,
-- otherwise the event's OWN `events.city`. Blank strings read as absent on both sides, so a Circle
-- with city = '' falls through to the event's city rather than returning ''. Nothing is
-- normalised here, on purpose: the city pages already run BOTH a Circle's city and an event's city
-- through the same TypeScript citySlug(), so the raw value is the right thing to return, exactly as
-- it is for the Circle's city today.
--
-- PRIVACY (ADR-186, ADR-825, ADR-1189, SCAN-209). City level is the public contract for events.
-- ADR-825 hides the EXACT venue (venue name, street, postal code, location line, geog) on a
-- hide_address event and states that city-level discovery is unchanged; SCAN-209
-- (20270330000000_events_pii_column_revoke.sql) revoked those exact columns from anon and
-- deliberately KEPT `city`, `region` and `country` readable. So a hide_address event may list by
-- its city, and this function still returns no street, postal code, venue, location line or geog.
--
-- Everything else is copied VERBATIM from 20270345002100_series_fold_in_two_rpcs.sql §2: same
-- signature, same RETURNS TABLE (so `create or replace` is enough and no caller changes), same
-- LANGUAGE / STABLE / SECURITY DEFINER / search_path, same five gates (ADR-903), same order and
-- limit. The grants are re-stated exactly as that file left them; `create or replace` keeps them,
-- and re-stating them makes this file safe to re-run on its own.
--
-- Verify after applying:
--   select count(*) filter (where circle_id is null and city is not null) as standalone_with_city,
--          count(*) filter (where circle_id is null and city is null)     as standalone_no_city
--   from public.public_events(200);
--   -- standalone_with_city > 0 whenever an upcoming public standalone event has events.city set.
--
-- ROLLBACK (manual): re-run 20270345002100_series_fold_in_two_rpcs.sql §2.

create or replace function public.public_events(_limit integer default 50)
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
         -- The Circle's city first (unchanged for every Circle event that has one), then the
         -- event's own city, so a standalone event lists under its city. City level only.
         coalesce(nullif(trim(c.city), ''), nullif(trim(e.city), '')),
         c.id, c.name, e.price_cents,
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
  'Upcoming PUBLISHED, PUBLIC, non-removed, non-demo events on a network-visible active Space (or no Space), for the anon /discover listings, the city pages and the marketing splash strips (narrowed by ADR-903). City only, never the venue: the Circle''s city, else the event''s own city, so a standalone event (ADR-254) lists under its city (a hide_address event included, ADR-825 keeps city-level discovery). Never draft, removed, unlisted, circle_only, private or demo. Carries parent_event_id + recurrence_type so the reader folds a series to one gathering (LIVE-206); the RPC itself still returns every date.';
