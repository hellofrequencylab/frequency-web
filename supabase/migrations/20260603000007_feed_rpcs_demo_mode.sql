-- =====================================================================
-- Make the feed RPCs respect the global demo switch (platform_flags.demo_mode).
--
-- When demo_mode is on (or the flag is missing — default on), demo posts show
-- as before. When an operator flips demo_mode off, is_demo posts drop out of
-- both the home feed and the circle/channel detail feed — matching the app-side
-- gating on the directory / circles / events lists (lib/platform-flags.ts).
--
-- Signature is unchanged from 20260603000005, so CREATE OR REPLACE is safe (no
-- drop needed). Only the WHERE gains one predicate:
--   and (not p.is_demo or coalesce((select value from platform_flags
--                                   where key = 'demo_mode'), true))
-- =====================================================================

create or replace function feed_for_viewer(_sort text default 'relevant', _limit integer default 40)
returns table (
  id               uuid,
  body             text,
  post_type        text,
  is_pinned        boolean,
  created_at       timestamptz,
  media_urls       text[],
  is_demo          boolean,
  reaction_count   integer,
  comment_count    integer,
  engagement_score numeric,
  scope_id         uuid,
  visibility       text,
  author           jsonb,
  reactions        jsonb
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
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
         ), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
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
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

create or replace function scoped_feed_for_viewer(
  _scope_ids uuid[],
  _sort      text default 'relevant',
  _limit     integer default 30
)
returns table (
  id               uuid,
  body             text,
  post_type        text,
  is_pinned        boolean,
  created_at       timestamptz,
  media_urls       text[],
  is_demo          boolean,
  reaction_count   integer,
  comment_count    integer,
  engagement_score numeric,
  scope_id         uuid,
  visibility       text,
  author           jsonb,
  reactions        jsonb
)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.body, p.post_type::text, p.is_pinned, p.created_at,
         p.media_urls, p.is_demo, p.reaction_count, p.comment_count, p.engagement_score,
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
         ), '[]'::jsonb) as reactions
  from posts p
  join profiles a on a.id = p.author_id
  where p.parent_id is null
    and p.hidden_at is null
    and p.scope_id = any(_scope_ids)
    and (not p.is_demo or coalesce((select value from platform_flags where key = 'demo_mode'), true))
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
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;
