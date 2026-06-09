-- =============================================================================
-- Connection Layer P2 — Orbits & Resonance engine (ADR-186)
--
-- Resonance is computed from REAL co-presence, never clicks: shared active circles,
-- co-attended events, the friendship + how it formed, with a recency bonus that
-- decays as you drift apart. Two SECURITY DEFINER RPCs, both scoped to the caller:
--   • my_orbit()    — your accepted friends, each with a resonance score + orbit band
--                     (inner / middle / outer) and the shared context behind it.
--   • near_misses() — people you're NOT connected to but keep crossing paths with
--                     (shared circles / co-events), the serendipity to close.
-- Privacy: near_misses respects the same discoverability tiers as the directory
-- (ghost_mode off, discoverable_by community/connections). Resonance is private to
-- the caller — never a public ranking (ADR-186 guardrail).
-- =============================================================================

-- ── my_orbit — your people, weighted by real co-presence ─────────────────────
create or replace function public.my_orbit(_limit int default 100)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         text,
  avatar_url     text,
  how_met        text,
  met_at         timestamptz,
  shared_circles int,
  co_events      int,
  last_together  timestamptz,
  resonance      numeric,
  orbit          text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select id from public.profiles where auth_user_id = auth.uid()),
  friends as (
    select
      case when f.user_a_id = (select id from me) then f.user_b_id else f.user_a_id end as other_id,
      f.how_met, f.met_at
    from public.friendships f
    where f.status = 'accepted'
      and (select id from me) in (f.user_a_id, f.user_b_id)
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
    select r2.profile_id as other_id, count(distinct r1.event_id)::int as n, max(e.starts_at) as last_at
    from public.event_rsvps r1
    join public.event_rsvps r2
      on r2.event_id = r1.event_id and r2.profile_id <> r1.profile_id and r2.status = 'going'
    join public.events e on e.id = r1.event_id
    where r1.profile_id = (select id from me) and r1.status = 'going'
    group by r2.profile_id
  )
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    fr.how_met, fr.met_at,
    coalesce(sc.n, 0) as shared_circles,
    coalesce(ce.n, 0) as co_events,
    ce.last_at as last_together,
    round(
      (coalesce(sc.n, 0) * 2.0)        -- each shared circle
      + (coalesce(ce.n, 0) * 3.0)      -- each event you both showed up to (worth more — in person)
      + 2.0                            -- being connected at all
      + coalesce(greatest(0, 10.0 - (extract(epoch from (now() - ce.last_at)) / 86400.0) / 14.0), 0)
                                       -- recency bonus, decaying ~linearly over a couple of weeks
    , 1) as resonance,
    case
      when ce.last_at is not null and ce.last_at > now() - interval '21 days'
           and (coalesce(sc.n, 0) + coalesce(ce.n, 0)) >= 2 then 'inner'
      when (coalesce(sc.n, 0) + coalesce(ce.n, 0)) >= 1 then 'middle'
      else 'outer'
    end as orbit
  from friends fr
  join public.profiles p on p.id = fr.other_id
  left join shared_circles sc on sc.other_id = fr.other_id
  left join co_events ce on ce.other_id = fr.other_id
  order by resonance desc
  limit greatest(_limit, 0);
$$;

comment on function public.my_orbit is
  'The caller''s connections weighted by real co-presence (shared circles, co-events, recency) → resonance + orbit band. Private to the caller (ADR-186).';

-- ── near_misses — people you keep crossing paths with but haven''t connected ──
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
  order by overlap desc, co_events desc
  limit greatest(_limit, 0);
$$;

comment on function public.near_misses is
  'People the caller repeatedly co-presents with (shared circles / co-events) but isn''t connected to — the serendipity to close. Respects discoverability tiers (ADR-186).';
