-- Open-feed switch: a reversible operator flag that lifts the main-feed reach gate.
--
-- The main feed (feed_for_viewer) normally enforces a "reach" model: a member sees
-- public posts plus the group/cluster posts of the circles + hubs + tuned channels
-- they belong to — i.e. their people ("friends") and nearby. Early in a community's
-- life that gate makes the feed look empty, so this adds a single switch to OPEN the
-- feed: when `platform_flags.feed_open` is true, every member sees every member's
-- posts (all non-hidden, top-level posts, demo content still gated by demo_mode).
-- Flip it back to false once there are enough members and the reach model should
-- apply again — the gate logic below is preserved verbatim, just short-circuited.
--
-- Scope: the MAIN feed only (feed_for_viewer). The scoped circle/channel reader
-- (scoped_feed_for_viewer) is unchanged — that surface is, by definition, already
-- scoped to the circle/channel you navigated to.

-- Default ON now (the owner wants the feed open during early Beta). `do nothing`
-- so a later operator flip is never clobbered by a re-run.
insert into public.platform_flags (key, value)
values ('feed_open', true)
on conflict (key) do nothing;

-- Re-create feed_for_viewer with the open-feed bypass as the FIRST visibility branch.
-- Everything else is identical to the prior definition: the demo gate, the geo lateral
-- join, the reach predicate (public / group-in-my-circles / cluster-via-hub-or-channel /
-- demo), and the sort. When feed_open is false the bypass is a no-op and behaviour is
-- exactly as before.
create or replace function public.feed_for_viewer(
  _sort text default 'relevant',
  _limit integer default 40,
  _lat double precision default null,
  _lng double precision default null,
  _radius_m integer default null
)
returns table(
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb,
  distance_m double precision
)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
    and (
         -- Open feed (operator switch): lift the reach gate so everyone sees everyone's
         -- posts. There is no private/DM post visibility, so this only ever surfaces
         -- community-scoped posts (public/group/cluster/region) that are not hidden.
         coalesce((select value from platform_flags where key = 'feed_open'), false)
      or p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
      or p.is_demo
    )
  order by
    case when _sort = 'nearby' and dist.distance_m is not null and dist.distance_m <= coalesce(_radius_m, 1e9) then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$function$;

comment on function public.feed_for_viewer(text, integer, double precision, double precision, integer) is
  'Main feed reader (SECURITY DEFINER). Enforces the reach gate (public + my circles'' group/cluster posts) UNLESS platform_flags.feed_open is true, which opens the feed so every member sees every member''s posts. Demo content stays gated by demo_mode.';
