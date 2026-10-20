-- A Mentor's Nexus Dispatch is read by the members of its region (SCAN-839).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- compose-kinds maps a nexus Dispatch to visibility 'region' with scope_id = the nexus region, and the
-- posts SELECT policy already admits it to a member whose profile sits in that region
-- (visibility = 'region' and scope_id = get_my_region_id()). The two feed RPCs are SECURITY DEFINER copies
-- of that policy and carried no region arm, so the Dispatch was saved and nobody saw it, the author
-- included. This adds the one arm to both, copied from the 20270346002000 definitions with nothing else
-- moved. A region post has no Circle, so post_scope_discoverable (TRUE for every non-Circle scope) lets it
-- through. Additive: create or replace, same signatures, same grants.

begin;

-- ── 1. scoped_feed_for_viewer ────────────────────────────────────────────────────────────────────
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
      or (p.visibility = 'region' and p.scope_id = get_my_region_id())
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

-- ── 2. feed_for_viewer ───────────────────────────────────────────────────────────────────────────
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
      or (p.visibility = 'region' and p.scope_id = get_my_region_id())
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

-- CATALOG PROOF: both RPCs name the region arm, and neither became anon-callable.
do $$
declare v_def text;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('feed_for_viewer', 'scoped_feed_for_viewer')
  loop
    if v_def not like '%get_my_region_id()%' then
      raise exception 'a feed RPC does not read region posts';
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
