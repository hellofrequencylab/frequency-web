-- THE SPACE COMMUNITY WALL: THE READ (ADR-1938, LIVE-2077).
--
-- The wall needs its own feed read. scoped_feed_for_viewer matches Circle scopes only and the page's
-- feed list answers a signed-out viewer with nothing, so a public wall had no way to render. This is
-- the same row shape as scoped_feed_for_viewer (so the existing post card renders it unchanged),
-- keyed on posts.scope_space_id and gated by the one rule the posts policy already uses:
-- private.can_read_space_wall. A wall the caller may not read returns no rows, never an error.
--
-- Additive: one new function. Callable by anon (a public wall is public) and authenticated.
-- Rollback: drop function public.space_wall_feed(uuid, integer, timestamptz).

create or replace function public.space_wall_feed(_space_id uuid, _limit integer default 30, _before timestamptz default null)
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
  where p.scope_space_id = _space_id
    and p.parent_id is null
    and p.hidden_at is null
    and p.visibility = 'cluster'
    and private.can_read_space_wall(_space_id)
    and (_before is null or p.created_at < _before)
  order by p.is_pinned desc, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

revoke all on function public.space_wall_feed(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.space_wall_feed(uuid, integer, timestamptz) to anon, authenticated;

comment on function public.space_wall_feed(uuid, integer, timestamptz) is
  'The Community wall of one Space, newest first with pinned posts on top (ADR-1938). Same row shape as scoped_feed_for_viewer. Empty when the caller may not read the wall (private.can_read_space_wall).';
