-- A member tuned into a Circle's second or third Channel reads its cluster posts (LIVE-730, ADR-1679).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- LIVE-666 let a Circle practice in up to three Channels (public.circle_channels, position 1
-- mirrored on circles.topical_channel_id), and discovery and the Channel pages match all three in
-- app code. Three readers still decided "a tuned-in member reads this Circle's cluster posts" on
-- the PRIMARY Channel only, by the owner's "Phase it" ruling. This is that second phase. Each of
-- the three arms that read
--     c.hub_id is null and c.topical_channel_id = any(T)
-- now reads
--     c.hub_id is null and (c.topical_channel_id = any(T)
--                           or exists (select 1 from circle_channels cc
--                                       where cc.circle_id = c.id and cc.topical_channel_id = any(T)))
-- where T is the tuned set that arm already used. Nothing else in any of the three moves.
--
--   1. The posts SELECT policy "posts: read by visibility (crew+ or public)" (last written by
--      20270345007700). Rewritten with ALTER POLICY, so its name, command and roles stay.
--   2. public.scoped_feed_for_viewer (last written by 20270345009100). It must keep saying what
--      the posts policy says (LIVE-335): same arms, same Space-member disjunct.
--   3. public.feed_for_viewer (last written by 20270227000000). The home stream. Only its tuned
--      arm widens; what home says first is otherwise untouched (ADR-1294).
-- The bodies below were read from production with pg_get_functiondef / pg_policies before writing.
--
-- RECURSION: circle_channels' read policy defers to the caller's view of public.circles
-- (20270346001100), and circles' policy never reads posts, so the exists() adds no cycle.
-- INDEXES: circle_channels has its primary key on (circle_id, topical_channel_id) and
-- ix_circle_channels_topical_channel_id, so the probe is an index lookup per candidate Circle.
--
-- GRANTS RE-DERIVED, NOT COPIED: scripts/function-grants.txt records `authenticated` for both
-- functions; restated from zero below, role-explicit (ADR-959). `create or replace` keeps the ACL.
--
-- PROVED BY supabase/tests/cluster_reads_every_circle_channel.test.sql (pgTAP, db-tests).
--
-- ROLLBACK: re-run the policy in 20270345007700, scoped_feed_for_viewer in 20270345009100 and
-- feed_for_viewer in 20270227000000.

begin;

-- ── 1. The posts policy ──────────────────────────────────────────────────────────────────────────
alter policy "posts: read by visibility (crew+ or public)" on public.posts
  using (
    ((private.get_my_role() >= 'member'::community_role) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists ( select 1 from circles c where ((c.id = posts.scope_id) and (((c.hub_id is not null) and (c.hub_id = any (private.get_my_hub_ids()))) or ((c.hub_id is null) and ((c.topical_channel_id = any (private.get_my_tuned_channel_ids())) or (exists ( select 1 from circle_channels cc where ((cc.circle_id = c.id) and (cc.topical_channel_id = any (private.get_my_tuned_channel_ids()))))))))))) or private.is_member_of_circle_space(scope_id)))))
    or (((select auth.uid()) is null) and (visibility = 'public'::post_visibility) and (parent_id is null))
  );

comment on policy "posts: read by visibility (crew+ or public)" on public.posts is
  'Signed-in member+: public posts; region posts in their region; group posts in their Circles; cluster posts in their Circles, their hubs'' Circles, the Circles practicing ANY of their tuned channels (primary or circle_channels, LIVE-730), or (LIVE-335) the Circles owned by a Space they belong to (private.is_member_of_circle_space). Anon: public top-level posts only.';

-- ── 2. scoped_feed_for_viewer ────────────────────────────────────────────────────────────────────
create or replace function public.scoped_feed_for_viewer(_scope_ids uuid[], _sort text default 'relevant'::text, _limit integer default 30)
 returns table(id uuid, body text, post_type text, is_pinned boolean, created_at timestamp with time zone, media_urls text[], is_demo boolean, reaction_count integer, comment_count integer, engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb)
 language sql
 stable security definer
 set search_path to 'public', 'private', 'pg_temp'
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier, 'is_system', a.is_system) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and p.scope_id = any(_scope_ids)
    and private.post_scope_discoverable(p.scope_id)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null
                            and (c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))
                                 -- LIVE-730: any of the Circle's Channels, not only the primary.
                                 or exists (select 1 from circle_channels cc
                                             where cc.circle_id = c.id
                                               and cc.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))))
                  )
               -- LIVE-335 / ADR-1514: a member of the Space that OWNS the Circle reads the Space's
               -- announcements there. The same disjunct the posts policy carries; a definer copy of
               -- the rule says exactly what the policy says, or it is a second rule.
               or private.is_member_of_circle_space(p.scope_id)))
      or p.is_demo
    )
  order by case when _sort = 'relevant' then p.engagement_score end desc nulls last, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

revoke all on function public.scoped_feed_for_viewer(uuid[], text, integer) from public, anon;
grant execute on function public.scoped_feed_for_viewer(uuid[], text, integer) to authenticated;

-- ── 3. feed_for_viewer ───────────────────────────────────────────────────────────────────────────
create or replace function public.feed_for_viewer(_sort text default 'relevant'::text, _limit integer default 40, _lat double precision default null::double precision, _lng double precision default null::double precision, _radius_m integer default null::integer)
 returns table(id uuid, body text, post_type text, is_pinned boolean, created_at timestamp with time zone, media_urls text[], is_demo boolean, reaction_count integer, comment_count integer, engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb, distance_m double precision)
 language sql
 stable security definer
 set search_path to 'public', 'private', 'pg_temp'
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role,
                            'membership_tier', a.membership_tier, 'is_system', a.is_system) as author,
         coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'reaction_type', pr.reaction_type, 'profile_id', pr.profile_id))
                   from post_reactions pr where pr.post_id = p.id), '[]'::jsonb) as reactions,
         dist.distance_m
  from posts p
  join profiles a on a.id = p.author_id
  left join lateral (
    select st_distance(c.geog, st_setsrid(st_makepoint(_lng, _lat), 4326)::geography) as distance_m
    from circles c
    where _lat is not null and _lng is not null and c.id = p.scope_id and c.geog is not null
  ) dist on true
  where p.parent_id is null
    and p.hidden_at is null
    and private.post_scope_discoverable(p.scope_id)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         coalesce((select value from platform_flags where key = 'feed_open'), false)
      or p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null
                            and (c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))
                                 -- LIVE-730: any of the Circle's Channels, not only the primary.
                                 or exists (select 1 from circle_channels cc
                                             where cc.circle_id = c.id
                                               and cc.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))))
                  )))
      or p.is_demo
    )
  order by
    case when _sort = 'nearby' and dist.distance_m is not null and dist.distance_m <= coalesce(_radius_m, 1e9) then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

revoke all on function public.feed_for_viewer(text, integer, double precision, double precision, integer) from public, anon;
grant execute on function public.feed_for_viewer(text, integer, double precision, double precision, integer) to authenticated;

-- CATALOG PROOF: all three now name circle_channels, and neither function became anon-callable.
do $$
declare v_def text;
begin
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'posts'
        and policyname = 'posts: read by visibility (crew+ or public)') not like '%circle_channels%' then
    raise exception 'the posts policy does not read circle_channels';
  end if;
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('feed_for_viewer', 'scoped_feed_for_viewer')
  loop
    if v_def not like '%circle_channels%' then
      raise exception 'a feed RPC does not read circle_channels';
    end if;
  end loop;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name in ('feed_for_viewer', 'scoped_feed_for_viewer')
       and privilege_type = 'EXECUTE' and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'a feed RPC became anon-executable; the verdict is authenticated';
  end if;
end $$;

commit;
