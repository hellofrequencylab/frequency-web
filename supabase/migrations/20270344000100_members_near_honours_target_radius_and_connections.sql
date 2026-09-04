-- members_near honours the TARGET's discovery radius and the 'connections' tier (ADR-186, ADR-TBD).
--
-- TWO PRIVACY CONTROLS ON /settings/connections DID NOT DO WHAT THEIR COPY SAYS.
--
-- 1. "Discoverability radius / How far away people can be and still discover you / Be findable
--    within ~N mi" writes profiles.discovery_radius_m. ADR-186 §3 is explicit that it is "the
--    member's OWN 'be findable within N' slider, not a filter on others". The candidate CTE below
--    never read p.discovery_radius_m at all. The only reader was app/(main)/network/page.tsx, which
--    passed the VIEWER's value in as `_radius_m`, i.e. how far the viewer looks. A member who
--    narrowed the slider to 5 miles believing they had vanished from strangers 30 miles away had
--    changed nothing for those strangers; what shrank was their own Nearby list. The label is
--    right and the query was wrong, so the query changes: a target is a candidate only when the
--    viewer's fuzzed cell lies within the TARGET's own radius. `_radius_m` stays as the viewer-side
--    bound, which is what its name always meant.
--
-- 2. "Who can find me nearby = My connections / Only people you're connected with" writes
--    discoverable_by = 'connections'. The CTE required `= 'community'`, so 'connections' and
--    'nobody' were the same predicate: the middle option silently collapsed to "No one". Now
--    'connections' means an ACCEPTED friendship with the viewer (friendships is canonically ordered
--    user_a_id < user_b_id, so the pair is looked up with least/greatest), and nothing else.
--
-- WHO THE VIEWER IS. This function is service_role-only (20270221000100/000200): every call comes
-- through createAdminClient(), under which auth.uid() is NULL, so the existing `me` CTE resolved to
-- nobody and (a) the caller was never excluded from their own results and (b) there was no identity
-- to resolve 'connections' against. A `_viewer` argument carries the caller's profile id in; the
-- auth.uid() path stays as the fallback so the function is still correct if it is ever invoked
-- with a user session. With NO viewer at all the 'connections' tier fails closed (a friendship with
-- nobody is no friendship) and no row is self-excluded, which is the pre-existing behaviour.
--
-- SIGNATURE. Adding an argument means `create or replace` would mint a second overload and leave
-- the old one live with its own grants, so the old signature is DROPPED first. A drop resets the
-- ACL to Postgres' default (PUBLIC) plus Supabase's default privileges (anon, authenticated), so
-- BOTH revokes are repeated here, role-explicit, exactly as 20270221000200 spells out: a
-- public-only revoke removes nothing (ADR-959), and scripts/check-function-grants.mjs models the
-- drop as a reset and would report this function open without them.
--
-- ORDERING. This file must sort AFTER 20270221000100 and 20270221000200, which revoke the
-- 4-argument signature by name; a lower version would replay the drop first and those revokes
-- would then fail on a signature that no longer exists.
--
-- The TypeScript twin of this candidate rule is lib/connections/directory-visibility.ts, and
-- lib/connections/directory-visibility.test.ts pins the clauses below against it.

begin;

drop function if exists public.members_near(numeric, numeric, integer, integer);

create function public.members_near(
  _lat numeric,
  _lng numeric,
  _radius_m integer default 40000,
  _limit integer default 60,
  _viewer uuid default null
)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  community_role text,
  band           text
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    -- The caller: the explicit argument (service-role path), else the session (user path).
    select coalesce(
      _viewer,
      (select id from public.profiles where auth_user_id = auth.uid())
    ) as id
  ),
  vcell as (
    select round(_lat, 2) as lat, round(_lng, 2) as lng
  ),
  candidates as (
    select
      p.id, p.display_name, p.handle, p.avatar_url, p.community_role::text as community_role,
      p.location_band,
      p.discovery_radius_m,
      st_distance(
        st_setsrid(st_makepoint(p.home_geocell_lng::float8, p.home_geocell_lat::float8), 4326)::geography,
        st_setsrid(st_makepoint((select lng from vcell)::float8, (select lat from vcell)::float8), 4326)::geography
      ) as d
    from public.profiles p
    where p.directory_visible = true
      and p.ghost_mode = false
      and (
        p.discoverable_by = 'community'
        or (
          p.discoverable_by = 'connections'
          and exists (
            select 1
            from public.friendships f
            where f.status = 'accepted'
              and f.user_a_id = least(p.id, (select id from viewer))
              and f.user_b_id = greatest(p.id, (select id from viewer))
          )
        )
      )
      and p.location_band <> 'hidden'
      and p.home_geocell_lat is not null
      and p.id <> coalesce((select id from viewer), '00000000-0000-0000-0000-000000000000'::uuid)
  )
  select
    c.id, c.display_name, c.handle, c.avatar_url, c.community_role,
    case
      -- A member who exposes only city-level precision is never shown finer than that,
      -- regardless of true proximity (ADR-186). Ranking still uses the fuzzed cell.
      when c.location_band = 'city' then 'your city'
      when c.d < 2000  then 'here'
      when c.d < 8000  then 'nearby'
      when c.d < 40000 then 'your area'
      else 'your city'
    end as band
  from candidates c
  -- Both bounds: the viewer's search radius AND the target's own "be findable within N".
  where c.d <= _radius_m
    and c.d <= c.discovery_radius_m
  order by c.d asc
  limit greatest(_limit, 0);
$$;

comment on function public.members_near is
  'Privacy-safe proximity directory: members within BOTH the viewer radius and each target''s own discovery_radius_m, honouring directory_visible / ghost_mode / discoverable_by (connections = accepted friendship with _viewer) / location_band, ordered by FUZZED-cell distance, returning only a coarse band label — never coordinates or meters (ADR-186).';

-- The drop above reset the ACL. Re-lock, both revokes, role-explicit (ADR-959).
revoke execute on function public.members_near(numeric, numeric, integer, integer, uuid) from anon, authenticated, public;
grant execute on function public.members_near(numeric, numeric, integer, integer, uuid) to service_role;

commit;

-- ROLLBACK: drop function if exists public.members_near(numeric, numeric, integer, integer, uuid);
-- then re-run the `create or replace function public.members_near` block of
-- 20260609060000_connection_layer_foundation.sql and the two revoke/grant lines of
-- 20270221000200_revoke_public_execute_the_grant_the_role_revoke_missed.sql.
