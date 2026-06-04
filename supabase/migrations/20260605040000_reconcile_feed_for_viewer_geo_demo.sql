-- Reconcile member_geo's location-aware feed_for_viewer WITH the live demo-mode
-- logic (the conflict flagged in COMMS-STRATEGY: the member_geo replacement dropped
-- the demo predicate the live function had). The result keeps `is_demo` + the demo
-- predicate (demo feed unbroken) AND adds geo params + `distance_m` + a 'nearby'
-- sort. Backward-compatible: existing feed_for_viewer('relevant', 40) calls resolve
-- to this with the geo params null -> identical behaviour.
--
-- NOTE: this SUPERSEDES the feed_for_viewer body in 20260604185000_member_geo_and_
-- local_feed.sql (which lacks the demo predicate). That migration's geo COLUMNS were
-- applied separately; this is the reconciled function.
drop function if exists public.feed_for_viewer(text, integer);

create or replace function public.feed_for_viewer(
  _sort     text             default 'relevant',
  _limit    integer          default 40,
  _lat      double precision default null,
  _lng      double precision default null,
  _radius_m integer          default null
)
returns table (
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb,
  distance_m double precision
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
         p.scope_id, p.visibility::text,
         jsonb_build_object('id', a.id, 'display_name', a.display_name, 'handle', a.handle,
                            'avatar_url', a.avatar_url, 'community_role', a.community_role) as author,
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
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
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
