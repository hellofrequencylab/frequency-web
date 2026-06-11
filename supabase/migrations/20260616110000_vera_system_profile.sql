-- =============================================================================
-- ADR-231 (part 2 of 2): the system account becomes Vera.
--
-- The owner's call: the moderation account IS Vera — the same voice that runs
-- the assistant and writes the Dispatches. One identity, one face.
--
--   1. Profile: display_name 'Vera'. (Handle/bio/avatar live in the parallel
--      workstream: 20260615400000 → @vera, 20260615500000 back to @moderation per
--      the owner, 20260615600000 the avatar; the warn-DM lookup keys on is_system,
--      so this update is handle-agnostic and idempotent over all of them.) Member-facing role chip reads "Moderator"
--      (client-side off is_system — the community_role enum is NOT extended).
--   2. Old welcome posts become 'system' lines and their bodies are normalized
--      to the one-line join notice, so feed history renders like the new ones.
--   3. search_handles_public excludes system accounts — fixes the mention
--      autocomplete, group-DM picker, room invites, and co-host search in one
--      place (the directory, people suggestions, leaderboard, store and admin
--      roster already filter is_system app-side).
--   4. feed_for_viewer / scoped_feed_for_viewer thread `is_system` into the
--      author jsonb so the client can brand her posts (identical to their
--      20260612060000 definitions plus that one key).
--
-- Depends on 20260616100000 (the 'system' post_type value, separate txn).
-- =============================================================================

-- ── 1. The profile ───────────────────────────────────────────────────────────

UPDATE profiles
SET display_name = 'Vera'
WHERE is_system = true;

-- ── 2. Old welcome posts → one-line system notices ───────────────────────────

UPDATE posts
SET post_type = 'system',
    body = '@' || substring(body FROM 'welcome @([a-zA-Z0-9_]+)') || ' joined the community 👋'
WHERE author_id IN (SELECT id FROM profiles WHERE is_system = true)
  AND body LIKE 'Everyone, welcome @%'
  AND substring(body FROM 'welcome @([a-zA-Z0-9_]+)') IS NOT NULL;

-- ── 3. People search never surfaces the system voice ─────────────────────────
-- Same shape as 20240204000000, plus the is_system filter.

CREATE OR REPLACE FUNCTION search_handles_public(q text)
RETURNS TABLE (
  id           uuid,
  handle       text,
  display_name text,
  avatar_url   text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.handle, p.display_name, p.avatar_url
  FROM   profiles p
  WHERE  p.is_active = true
    AND  p.is_system = false
    AND  (p.handle ILIKE q || '%' OR p.display_name ILIKE q || '%')
  ORDER BY p.display_name
  LIMIT 6;
$$;

GRANT EXECUTE ON FUNCTION search_handles_public(text) TO anon, authenticated;

-- ── 4. Feed RPCs — `is_system` joins the author payload ──────────────────────
-- Identical to 20260612060000 plus the one jsonb key in each.

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
         p.visibility = 'public'
      or (p.visibility = 'group' and p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[])))
      or (p.visibility = 'cluster'
          and (p.scope_id = any(coalesce(get_my_circle_ids(), '{}'::uuid[]))
               or exists (select 1 from circles c where c.id = p.scope_id
                      and ((c.hub_id is not null and c.hub_id = any(coalesce(get_my_hub_ids(), '{}'::uuid[])))
                        or (c.hub_id is null and c.topical_channel_id = any(coalesce(get_my_tuned_channel_ids(), '{}'::uuid[]))))
                  )))
      -- Demo content is community-wide "lived-in" filler: gated by demo_mode above,
      -- it reaches every viewer's feed regardless of membership.
      or p.is_demo
    )
  order by
    case when _sort = 'nearby' and dist.distance_m is not null and dist.distance_m <= coalesce(_radius_m, 1e9) then 0 else 1 end,
    case when _sort = 'nearby' then dist.distance_m end asc nulls last,
    case when _sort = 'relevant' then p.engagement_score end desc nulls last,
    p.created_at desc
  limit greatest(1, least(coalesce(_limit, 40), 100));
$$;

create or replace function public.scoped_feed_for_viewer(
  _scope_ids uuid[],
  _sort      text    default 'relevant',
  _limit     integer default 30
)
returns table (
  id uuid, body text, post_type text, is_pinned boolean, created_at timestamptz,
  media_urls text[], is_demo boolean, reaction_count integer, comment_count integer,
  engagement_score numeric, scope_id uuid, visibility text, author jsonb, reactions jsonb
)
language sql stable security definer set search_path = public
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
      -- Demo content surfaces on a demo circle's wall for any viewer (the claim flow
      -- shows a furnished, not empty, circle); gated by demo_mode above.
      or p.is_demo
    )
  order by case when _sort = 'relevant' then p.engagement_score end desc nulls last, p.created_at desc
  limit greatest(1, least(coalesce(_limit, 30), 100));
$$;

revoke all on function public.feed_for_viewer(text, integer, double precision, double precision, integer) from public, anon;
grant execute on function public.feed_for_viewer(text, integer, double precision, double precision, integer) to authenticated;
revoke all on function public.scoped_feed_for_viewer(uuid[], text, integer) from public, anon;
grant execute on function public.scoped_feed_for_viewer(uuid[], text, integer) to authenticated;
