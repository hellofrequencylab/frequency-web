-- Vera Marketing Intelligence · Phase 1 (data spine). Deterministic SQL aggregates
-- over the ledger + community tables — the facts the AI strategy + per-role seed
-- prompts ride on. Admin-only (revoked from public; granted to service_role).
-- Applied via MCP. See docs/CONTENT-ARCHITECTURE.md / the build plan.

create or replace function public.mkt_growth(_days int default 90)
returns table (week date, new_members bigint, new_circles bigint, new_events bigint)
language sql stable security definer set search_path to 'public' as $$
  with weeks as (
    select generate_series(date_trunc('week', now() - make_interval(days => _days)),
                           date_trunc('week', now()), interval '1 week')::date as week
  )
  select w.week,
    (select count(*) from profiles p where date_trunc('week', p.created_at)::date = w.week)::bigint,
    (select count(*) from circles  c where date_trunc('week', c.created_at)::date = w.week)::bigint,
    (select count(*) from events   e where date_trunc('week', e.created_at)::date = w.week)::bigint
  from weeks w order by w.week;
$$;

create or replace function public.mkt_interest_demand()
returns table (domain text, interest text, interest_slug text, tune_ins bigint, circles bigint, members bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(d.name, 'Unsorted'), tc.name, tc.slug,
    (select count(*) from topical_channel_memberships m where m.topical_channel_id = tc.id)::bigint,
    (select count(*) from circles c where c.topical_channel_id = tc.id)::bigint,
    (select coalesce(sum(c.member_count),0) from circles c where c.topical_channel_id = tc.id)::bigint
  from topical_channels tc
  left join domains d on d.id = tc.domain_id
  where tc.is_active
  order by 4 desc, 5 desc;
$$;

create or replace function public.mkt_geo()
returns table (city text, circles bigint, members bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(trim(c.city), ''), 'Unknown'),
         count(*)::bigint, coalesce(sum(c.member_count),0)::bigint
  from circles c group by 1 order by 2 desc, 3 desc;
$$;

create or replace function public.mkt_content_performance(_days int default 30, _limit int default 20)
returns table (post_id uuid, created_at timestamptz, author text, engagement_score numeric, reactions int, comments int, excerpt text)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.created_at, pr.display_name, p.engagement_score, p.reaction_count, p.comment_count, left(p.body, 140)
  from posts p left join profiles pr on pr.id = p.author_id
  where p.parent_id is null and p.hidden_at is null
    and p.created_at >= now() - make_interval(days => _days)
  order by p.engagement_score desc nulls last, p.created_at desc
  limit greatest(1, least(_limit, 100));
$$;

create or replace function public.mkt_leader_activity()
returns table (profile_id uuid, leader text, role text, circles bigint, members bigint,
               last_post timestamptz, last_event timestamptz, season_zaps int, lifetime_gems int)
language sql stable security definer set search_path to 'public' as $$
  select pr.id, pr.display_name, pr.community_role::text,
    (select count(*) from circles c where c.host_id = pr.id)::bigint,
    (select coalesce(sum(c.member_count),0) from circles c where c.host_id = pr.id)::bigint,
    (select max(po.created_at) from posts po where po.author_id = pr.id),
    (select max(e.created_at)  from events e where e.host_id = pr.id),
    pr.current_season_zaps, pr.lifetime_gems
  from profiles pr
  where pr.community_role in ('host','guide','mentor')
  order by 5 desc;
$$;

revoke execute on function
  public.mkt_growth(int), public.mkt_interest_demand(), public.mkt_geo(),
  public.mkt_content_performance(int,int), public.mkt_leader_activity()
  from public, anon, authenticated;
grant execute on function
  public.mkt_growth(int), public.mkt_interest_demand(), public.mkt_geo(),
  public.mkt_content_performance(int,int), public.mkt_leader_activity()
  to service_role;
