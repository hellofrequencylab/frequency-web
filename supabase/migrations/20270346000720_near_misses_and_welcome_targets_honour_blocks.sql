-- =============================================================================
-- near_misses() and welcome_targets() honour blocks (SCAN-718).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- blockUser (lib/blocking.ts) deletes the friendship row, so a blocked person leaves the
-- "connected" exclusion in near_misses and qualifies again the moment the pair share a circle or
-- a going RSVP, in both directions, with a Connect button beside their name. welcome_targets never
-- read blocked_users at all, so a newcomer who blocked you (or whom you blocked) was still offered
-- as someone to welcome, and the welcome paid gems and wrote them a notification.
--
-- Both bodies are the 20260609070000 / 20260609090000 definitions with ONE added predicate: no row
-- for a profile the caller has blocked or been blocked by. Signatures unchanged. The browser grants
-- from 20270304000000 are restated so the file is correct standalone under a replay (create or
-- replace keeps the ACL, but stating it is what the ledger checks). recordWelcome carries the same
-- check on the write side (lib/connections/welcomes.ts).
-- =============================================================================

create or replace function public.near_misses(_limit int default 20)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  shared_circles int,
  co_events      int,
  overlap        int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid()),
  -- everyone already connected (accepted OR pending) — excluded from near-misses
  connected as (
    select case when f.user_a_id = (select id from me) then f.user_b_id else f.user_a_id end as other_id
    from public.friendships f
    where (select id from me) in (f.user_a_id, f.user_b_id)
  ),
  shared_circles as (
    select m2.profile_id as other_id, count(*)::int as n
    from public.memberships m1
    join public.memberships m2
      on m2.circle_id = m1.circle_id and m2.profile_id <> m1.profile_id and m2.status = 'active'
    where m1.profile_id = (select id from me) and m1.status = 'active'
    group by m2.profile_id
  ),
  co_events as (
    select r2.profile_id as other_id, count(distinct r1.event_id)::int as n
    from public.event_rsvps r1
    join public.event_rsvps r2
      on r2.event_id = r1.event_id and r2.profile_id <> r1.profile_id and r2.status = 'going'
    where r1.profile_id = (select id from me) and r1.status = 'going'
    group by r2.profile_id
  ),
  candidates as (
    select
      coalesce(sc.other_id, ce.other_id) as other_id,
      coalesce(sc.n, 0) as sc_n,
      coalesce(ce.n, 0) as ce_n
    from shared_circles sc
    full outer join co_events ce on ce.other_id = sc.other_id
  )
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    c.sc_n as shared_circles, c.ce_n as co_events,
    (c.sc_n + c.ce_n) as overlap
  from candidates c
  join public.profiles p on p.id = c.other_id
  where c.other_id <> (select id from me)
    and c.other_id not in (select other_id from connected)
    and p.ghost_mode = false
    and p.discoverable_by in ('community', 'connections')
    and (c.sc_n + c.ce_n) >= 1
    -- SCAN-718: a block in either direction removes the pair.
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = (select id from me) and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = (select id from me))
    )
  order by overlap desc, co_events desc
  limit greatest(_limit, 0);
$$;

comment on function public.near_misses is
  'People the caller repeatedly co-presents with (shared circles / co-events) but isn''t connected to — the serendipity to close. Respects discoverability tiers (ADR-186) and blocks in either direction (SCAN-718).';

create or replace function public.welcome_targets(_days int default 14, _limit int default 12)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  joined_at      timestamptz,
  shared_circles int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid()),
  my_circles as (
    select circle_id from public.memberships
    where profile_id = (select id from me) and status = 'active'
  ),
  welcomed as (
    select newcomer_id from public.welcomes where welcomer_id = (select id from me)
  )
  select
    p.id, p.display_name, p.handle, p.avatar_url, p.created_at,
    (select count(*) from public.memberships m
       where m.profile_id = p.id and m.status = 'active'
         and m.circle_id in (select circle_id from my_circles))::int as shared_circles
  from public.profiles p
  where p.created_at > now() - make_interval(days => _days)
    and p.id <> (select id from me)
    and p.ghost_mode = false
    and p.id not in (select newcomer_id from welcomed)
    and exists (
      select 1 from public.memberships m
      where m.profile_id = p.id and m.status = 'active'
        and m.circle_id in (select circle_id from my_circles)
    )
    -- SCAN-718: a block in either direction removes the pair.
    and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = (select id from me) and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = (select id from me))
    )
  order by p.created_at desc
  limit greatest(_limit, 0);
$$;

comment on function public.welcome_targets is
  'Newcomers (joined within _days) in the caller''s circles that the caller hasn''t welcomed yet (ADR-186, P3b), never across a block (SCAN-718).';

-- Browser grants, restated from 20270304000000: signed-in members and the service role only.
revoke execute on function public.near_misses(integer) from public, anon;
revoke execute on function public.welcome_targets(integer, integer) from public, anon;
grant execute on function public.near_misses(integer) to authenticated, service_role;
grant execute on function public.welcome_targets(integer, integer) to authenticated, service_role;
