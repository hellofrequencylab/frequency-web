-- =====================================================================
-- Phase A (COMMS-STRATEGY / ADR-088): put the MEMBER on the map and make
-- the feed location-aware ("nearby activity first").
--
-- Today only *circles* are geo-indexed (PostGIS geog, migration 20240214).
-- Members capture a location during onboarding but it only lives in
-- profiles.meta.beta.location (free JSON) and nothing reads it. This
-- migration promotes that to first-class geo columns + a generated PostGIS
-- point (mirroring circles.geog), backfills from the existing JSON, and
-- adds a `nearby` sort mode to feed_for_viewer driven by the member's
-- coordinates + radius slider.
--
-- Additive and backward-compatible: existing feed_for_viewer('relevant', 40)
-- calls keep working (new params default to null → identical behaviour).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Member geo columns on profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists home_lat       numeric(9,6),
  add column if not exists home_lng       numeric(9,6),
  add column if not exists home_label     text,
  add column if not exists home_timezone  text,
  -- "how local" bleed-over radius (metres) — the member radius slider (ADR-088).
  -- 25 km default: sensible city-scale starting point.
  add column if not exists feed_radius_m  integer not null default 25000,
  -- Transient live location (only set when the member opts into the live-GPS
  -- toggle while "out"); home is the durable anchor.
  add column if not exists live_lat        numeric(9,6),
  add column if not exists live_lng        numeric(9,6),
  add column if not exists live_updated_at timestamptz,
  add column if not exists location_mode   text not null default 'home'
    check (location_mode in ('home', 'live'));

-- A maintained PostGIS point from the durable home coordinates. STORED +
-- GENERATED auto-syncs on every write and can never drift (same pattern as
-- circles.geog). Used by the "near you now" counter and member-proximity work.
alter table public.profiles
  add column if not exists home_geog geography(Point, 4326)
  generated always as (
    case
      when home_lat is not null and home_lng is not null
      then st_setsrid(st_makepoint(home_lng, home_lat), 4326)::geography
      else null
    end
  ) stored;

create index if not exists profiles_home_geog_gix
  on public.profiles using gist (home_geog);

comment on column public.profiles.home_geog is
  'Auto-generated PostGIS point from home_lat/home_lng (SRID 4326). Proximity only; do not write directly.';
comment on column public.profiles.feed_radius_m is
  'Member-controlled "how local" radius in metres (the feed radius slider, ADR-088).';

-- ---------------------------------------------------------------------
-- 2. Backfill home_* from the existing onboarding JSON (meta.beta.location)
--    Guarded: only well-formed numeric lat/lng, only where not already set.
-- ---------------------------------------------------------------------
update public.profiles p
set home_lat      = (p.meta #>> '{beta,location,lat}')::numeric,
    home_lng      = (p.meta #>> '{beta,location,lng}')::numeric,
    home_label    = coalesce(p.home_label,    nullif(p.meta #>> '{beta,location,label}',    '')),
    home_timezone = coalesce(p.home_timezone, nullif(p.meta #>> '{beta,location,timezone}', ''))
where p.home_lat is null
  and (p.meta #>> '{beta,location,lat}') ~ '^-?[0-9]+(\.[0-9]+)?$'
  and (p.meta #>> '{beta,location,lng}') ~ '^-?[0-9]+(\.[0-9]+)?$';

-- ---------------------------------------------------------------------
-- 3. Location-aware feed: add an optional `nearby` sort + distance output.
--    Drop the 2-arg form and recreate as one function whose new trailing
--    params default to null, so old call sites are unaffected.
-- ---------------------------------------------------------------------
drop function if exists feed_for_viewer(text, integer);

create or replace function feed_for_viewer(
  _sort     text             default 'relevant',  -- 'relevant' | 'recent' | 'nearby'
  _limit    integer          default 40,
  _lat      double precision default null,
  _lng      double precision default null,
  _radius_m integer          default null
)
returns table (
  id               uuid,
  body             text,
  post_type        text,
  is_pinned        boolean,
  created_at       timestamptz,
  media_urls       text[],
  reaction_count   integer,
  comment_count    integer,
  engagement_score numeric,
  scope_id         uuid,
  visibility       text,
  author           jsonb,
  reactions        jsonb,
  distance_m       double precision
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object(
           'id', a.id,
           'display_name', a.display_name,
           'handle', a.handle,
           'avatar_url', a.avatar_url,
           'community_role', a.community_role
         ) as author,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
           from post_reactions pr
           where pr.post_id = p.id
         ), '[]'::jsonb) as reactions,
         dist.distance_m
  from posts p
  join profiles a on a.id = p.author_id
  -- Distance from the viewer to the post's circle (group/cluster posts are
  -- circle-scoped); null for profile-scoped / public posts and when no coords.
  left join lateral (
    select st_distance(
             c.geog,
             st_setsrid(st_makepoint(_lng, _lat), 4326)::geography
           ) as distance_m
    from circles c
    where _lat is not null and _lng is not null
      and c.id = p.scope_id
      and c.geog is not null
  ) dist on true
  where p.parent_id is null
    and p.hidden_at is null
    and (
         p.visibility = 'public'
      or (p.visibility = 'group'
          and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (
                    select 1 from circles c
                    where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
    )
  order by
    -- 'nearby': within-radius circle posts first, then by ascending distance;
    -- located-but-far and non-located (public/global) posts fall below.
    case when _sort = 'nearby'
              and dist.distance_m is not null
              and dist.distance_m <= coalesce(_radius_m, 1e9)
         then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    -- 'relevant'/'recent' parity with the prior behaviour.
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

revoke all on function feed_for_viewer(text, integer, double precision, double precision, integer) from public, anon;
grant execute on function feed_for_viewer(text, integer, double precision, double precision, integer) to authenticated;

-- =====================================================================
-- VERIFICATION (after apply + type regen):
--  A. select * from feed_for_viewer('relevant', 40);  -- unchanged behaviour,
--     distance_m null throughout (no coords passed).
--  B. select id, distance_m from feed_for_viewer('nearby', 40, 32.7157, -117.1611, 25000)
--     as a member near San Diego: their nearby circle posts sort first by
--     distance; public/global posts follow.
--  C. profiles backfill: members who set a location in onboarding now have
--     home_lat/home_lng/home_geog populated.
-- =====================================================================
