-- =====================================================================
-- RLS convergence — surface 3: the main feed (Phase 2, ADR-056).
--
-- components/feed/feed-list.tsx read posts through the service-role admin client
-- and re-implemented the whole reach model in application code (public + group
-- in my circles + cluster reachable via a shared hub or a tuned topical channel),
-- joining the author profile and post_reactions. Converging it to the user
-- client needs a SECURITY DEFINER RPC because:
--   • the `posts: crew+ read by visibility` policy is gated on role >= crew, so a
--     plain user-client select would drop a MEMBER's own circle/cluster posts
--     (members would see only public) — a behaviour regression;
--   • the read joins `profiles` (crew+/in-region read policy) and `post_reactions`
--     (crew+ read policy), which RLS hides from sub-crew viewers.
-- The RPC scopes to the caller via the SAME reach helpers the RLS policy uses
-- (get_my_circle_ids / get_my_hub_ids / get_my_tuned_channel_ids), works for ALL
-- roles, and returns only the author's PUBLIC fields. It mirrors the exact reach
-- the feed showed before (public + group + cluster; region is intentionally
-- omitted, matching the prior code), so behaviour is preserved.
--
-- Scope of this surface: the MAIN feed read only. The circle/channel detail mode
-- (FeedList with scoped circleIds) and the auxiliary scope/dispatch/event lookups
-- stay on the admin client for now — separate follow-up surfaces.
-- =====================================================================

create or replace function feed_for_viewer(_sort text default 'relevant', _limit integer default 40)
returns table (
  id               uuid,
  body             text,
  post_type        text,
  is_pinned        boolean,
  created_at       timestamptz,
  media_urls       text[],
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
         p.media_urls, p.reaction_count, p.comment_count, p.engagement_score,
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

revoke all on function feed_for_viewer(text, integer) from public, anon;
grant execute on function feed_for_viewer(text, integer) to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types):
--  A. As a MEMBER (sub-crew): the feed still shows their circle/cluster posts
--     (not just public) and each post keeps its author + reactions — proves the
--     DEFINER RPC restores what the crew+ RLS policy would have dropped.
--  B. As any viewer U2 (PostgREST, U2's JWT): select * from feed_for_viewer();
--     returns only public + U2's group/cluster-reachable posts; never another
--     user's private-circle posts.
--  C. Logged out (anon): execute denied (authenticated-only).
-- =====================================================================
