-- =====================================================================
-- RLS convergence — surface 4: the feed DETAIL mode (Phase 2, ADR-056).
--
-- The circle/channel detail pages render <FeedList showPublicLayer={false}
-- circleIds={[scopeId]} />, which read posts through the service-role admin
-- client filtered only by `scope_id IN (...)` — with NO per-post visibility
-- check. Because circle-wall posts are created 'group' (members-only) while
-- channel-forum / profile-wall posts are 'public', the admin path leaked a
-- circle's members-only posts to any visitor who could open the page.
--
-- This converges the read to a SECURITY DEFINER RPC that applies the SAME reach
-- predicate as the main feed (feed_for_viewer, surface 3) but constrained to the
-- requested scope ids. A DEFINER RPC is required for the same reason as the main
-- feed: the `posts: crew+ read by visibility` policy is gated on role >= crew, so
-- a plain user-client select would drop a MEMBER's own circle posts, and the read
-- joins `profiles` + `post_reactions` whose RLS hides them from sub-crew viewers.
--
-- Behaviour change (intended, owner-approved): a non-member / visitor now sees
-- only the PUBLIC posts of a circle, not its 'group' members-only posts. Members
-- viewing their own circles are unaffected (group + cluster + public all show);
-- channel forums are public, so unaffected.
--
-- Region visibility is omitted (mirrors feed_for_viewer): 'region' posts are
-- scoped to a region id, never a circle/channel id, so the branch is a no-op for
-- these callers.
-- =====================================================================

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
    and p.scope_id = any(_scope_ids)
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

revoke all on function scoped_feed_for_viewer(uuid[], text, integer) from public, anon;
grant execute on function scoped_feed_for_viewer(uuid[], text, integer) to authenticated;

-- =====================================================================
-- VERIFICATION (run after `supabase db push`, then regen types):
--  A. As a MEMBER of circle X: select * from scoped_feed_for_viewer(array[X])
--     returns the circle's group + public posts, each with author + reactions.
--  B. As a NON-MEMBER (any role) of public circle X: returns only X's PUBLIC
--     posts — never its 'group' members-only posts (the leak is closed).
--  C. Channel forum F (public posts): select * from scoped_feed_for_viewer(array[F])
--     returns its public posts for any authenticated viewer.
--  D. Logged out (anon): execute denied (authenticated-only).
-- =====================================================================
