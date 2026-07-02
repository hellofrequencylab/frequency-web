-- Phase F: consolidate multiple_permissive_policies (advisor 0006).
--
-- WHAT + WHY. The performance advisor flags multiple_permissive_policies: a table with >1
-- PERMISSIVE policy for the SAME (role, action) must evaluate EVERY such policy on every relevant
-- row. Each {public} policy fans out across 6 Postgres roles, so a single 2-policy SELECT cluster
-- shows up as 6 findings. This migration merges each cluster into ONE policy per (role, action)
-- whose predicate is the exact OR of the predicates it replaces. RLS permissive policies already
-- combine with OR, so an OR'd single policy is SEMANTICALLY IDENTICAL and simply cheaper to plan.
-- RESTRICTIVE policies (combined with AND) are NEVER touched.
--
-- Every predicate below is a byte-faithful copy of the live policy qual/with_check (verified
-- against pg_policies before writing). Covers the 6 highest-count {public} tables (54 findings):
-- post_reactions (18), posts (12), applications (6), events (6), user_achievements (6),
-- waitlist_entries (6). Follow-up (2 findings, both {authenticated}): dispatch_likes and
-- space_subscription_items -- see the foot of this file.
--
-- NO NEW FUNCTIONS / RPCS. Pure policy DDL; RLS policies take no GRANTs, and every helper referenced
-- already exists with its correct SECURITY DEFINER + pinned search_path + service_role grants.
-- IDEMPOTENT: drop-if-exists then create. Atomic (one transaction). No em or en dashes.

-- ============================================================================================
-- post_reactions  (TO public): 3 clusters -> 3 policies. 18 findings cleared.
-- ============================================================================================

-- SELECT: crew+ read  OR  member read on a space_update thread.
drop policy if exists "post_reactions: crew+ read" on public.post_reactions;
drop policy if exists "post_reactions: member read on space update" on public.post_reactions;
create policy "post_reactions: read (crew+ or space update)"
  on public.post_reactions for select
  using (
    (public.get_my_role() >= 'member'::community_role)
    or ((public.get_my_profile_id() is not null) and public.is_space_update_post(post_id))
  );

-- INSERT: crew+ insert own  OR  member insert own on a space_update thread.
drop policy if exists "post_reactions: crew+ insert own" on public.post_reactions;
drop policy if exists "post_reactions: member insert own on space update" on public.post_reactions;
create policy "post_reactions: insert own (crew+ or space update)"
  on public.post_reactions for insert
  with check (
    ((public.get_my_role() >= 'member'::community_role)
      and (profile_id in (select profiles.id from profiles where (profiles.auth_user_id = (select auth.uid())))))
    or ((profile_id = public.get_my_profile_id()) and public.is_space_update_post(post_id))
  );

-- DELETE: delete own  OR  member delete own on a space_update thread.
drop policy if exists "post_reactions: delete own" on public.post_reactions;
drop policy if exists "post_reactions: member delete own on space update" on public.post_reactions;
create policy "post_reactions: delete own (feed or space update)"
  on public.post_reactions for delete
  using (
    (profile_id in (select profiles.id from profiles where (profiles.auth_user_id = (select auth.uid()))))
    or ((profile_id = public.get_my_profile_id()) and public.is_space_update_post(post_id))
  );

-- ============================================================================================
-- posts  (SELECT + INSERT). 12 findings cleared.
-- ============================================================================================

-- SELECT cluster has THREE policies: two TO public (crew+ read, space-update read) and one TO anon
-- (public top-level read). To land exactly ONE policy per role while preserving identical semantics,
-- the anon predicate is folded into the single TO public policy behind an anon gate:
-- (select auth.uid()) is null. auth.uid() is null ONLY for a logged-out request, so:
--   * anon          -> crew+(false) OR space-update(false) OR (null-uid AND public AND top-level)
--                      == exactly the old anon policy. IDENTICAL.
--   * authenticated -> crew+ OR space-update OR (uid-present -> false)
--                      == exactly the two old public policies. IDENTICAL.
-- (get_my_role()/get_my_profile_id() are null for anon, so the two content predicates were already
-- false for anon.) Predicates below are byte-faithful copies of the live policy quals.
drop policy if exists "posts: crew+ read by visibility" on public.posts;
drop policy if exists "posts: member read space update thread" on public.posts;
drop policy if exists "posts: public read top-level public posts" on public.posts;
create policy "posts: read by visibility (crew+, space update, or public)"
  on public.posts for select
  using (
    ((public.get_my_role() >= 'member'::community_role) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = public.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (public.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (public.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (((c.hub_id is not null) and (c.hub_id = any (public.get_my_hub_ids()))) or ((c.hub_id is null) and (c.topical_channel_id = any (public.get_my_tuned_channel_ids())))))))))))
    or ((public.get_my_profile_id() is not null) and (hidden_at is null) and public.is_space_update_post(id))
    or (((select auth.uid()) is null) and (visibility = 'public'::post_visibility) and (parent_id is null))
  );

-- INSERT: crew+ insert in scope  OR  member space-update comment. Both TO public.
drop policy if exists "posts: crew+ insert in scope" on public.posts;
drop policy if exists "posts: member comment on space update" on public.posts;
create policy "posts: insert (crew+ in scope or space-update comment)"
  on public.posts for insert
  with check (
    ((public.get_my_role() >= 'member'::community_role) and (author_id = public.get_my_profile_id()) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = public.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (public.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (public.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (c.host_id = public.get_my_profile_id()))))))))
    or ((author_id = public.get_my_profile_id()) and (parent_id is not null) and public.is_space_update_post(parent_id))
  );

-- ============================================================================================
-- applications  (TO public): own read OR staff read. 6 findings cleared.
-- ============================================================================================
drop policy if exists "applications: own read" on public.applications;
drop policy if exists "applications: staff read" on public.applications;
create policy "applications: own or staff read"
  on public.applications for select
  using (
    (applicant_profile_id = public.get_my_profile_id())
    or (public.get_my_web_role() = any (array['admin'::text, 'janitor'::text]))
  );

-- ============================================================================================
-- events  (UPDATE): the two PERMISSIVE update policies. The RESTRICTIVE events_space_writable_upd
-- is left untouched (it AND-combines regardless). 6 findings cleared.
--
-- SUBTLETY: "events: host/guide/mentor update in scope" has with_check = NULL, so its effective
-- WITH CHECK DEFAULTS to its USING expression. The merged WITH CHECK must therefore be
-- (USING_hostguide OR WITH_CHECK_poster), NOT (NULL OR WITH_CHECK_poster). Merged USING is the plain
-- OR of the two USING expressions.
-- ============================================================================================
drop policy if exists "events: host/guide/mentor update in scope" on public.events;
drop policy if exists "events: poster updates own draft" on public.events;
create policy "events: host/guide/mentor or poster-draft update"
  on public.events for update
  using (
    ((host_id = public.get_my_profile_id()) or ((public.get_my_role() >= 'guide'::community_role) and (scope_id = any (public.get_my_circle_ids()))))
    or ((status = 'draft'::text) and (posted_by_profile_id = public.get_my_profile_id()))
  )
  with check (
    ((host_id = public.get_my_profile_id()) or ((public.get_my_role() >= 'guide'::community_role) and (scope_id = any (public.get_my_circle_ids()))))
    or (posted_by_profile_id = public.get_my_profile_id())
  );

-- ============================================================================================
-- user_achievements  (TO public): crew+ read others OR (read own OR mentor reads all).
-- 6 findings cleared. (get_my_role() >= 'host' is subsumed by >= 'member' but preserved verbatim.)
-- ============================================================================================
drop policy if exists "user_achievements: crew+ read others" on public.user_achievements;
drop policy if exists "user_achievements: read own or mentor reads all" on public.user_achievements;
create policy "user_achievements: read own, crew+, or mentor"
  on public.user_achievements for select
  using (
    (public.get_my_role() >= 'member'::community_role)
    or ((profile_id = public.get_my_profile_id()) or (public.get_my_role() >= 'host'::community_role))
  );

-- ============================================================================================
-- waitlist_entries  (TO public): own read OR staff read. 6 findings cleared.
-- ============================================================================================
drop policy if exists "waitlist_entries: own read" on public.waitlist_entries;
drop policy if exists "waitlist_entries: staff read" on public.waitlist_entries;
create policy "waitlist_entries: own or staff read"
  on public.waitlist_entries for select
  using (
    (profile_id = public.get_my_profile_id())
    or (public.get_my_web_role() = any (array['admin'::text, 'janitor'::text]))
  );

-- ============================================================================================
-- Rollback (hand-review aid). Re-create the originals, drop the merged ones. Each original name +
-- exact predicate is preserved in the DROP lines above / this file's git history and in the source
-- migrations. Reverting restores the exact prior posture; no data is touched.
--
-- FOLLOW-UP (not in this migration): the remaining 2 findings, both role {authenticated}.
--   1. space_subscription_items (authenticated SELECT, 2 policies) -- trivial 2->1 OR merge.
--   2. dispatch_likes (authenticated SELECT, 2 policies) -- SHAPE CHANGE (an ALL policy overlaps a
--      SELECT-true policy on the SELECT action); split the ALL policy into INSERT/UPDATE/DELETE own
--      policies and keep the SELECT-true read (true OR own == true). Deferred for its own review.
-- ============================================================================================
