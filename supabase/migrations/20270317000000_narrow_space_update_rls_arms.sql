-- C3.5: narrow the is_space_update_post RLS arms out of posts / post_reactions, and drop the
-- helper (ADR-1091 slice 5, LIVE-059; docs/CIRCLES-C3-PLAN.md §2.3 + §7.2).
--
-- WHAT. The Space Communities wall let ANY signed-in profile, platform-wide, read every post in a
-- space_update thread (any visibility, no Space term), reply under one, and read / add / remove
-- reactions on one. That carve-out rode as an OR arm inside 5 permissive policies, each keyed on
-- private.is_space_update_post(...) (added 20260918000300, consolidated 20261004000000, moved to
-- the private schema 20270101000000):
--
--   posts           "posts: read by visibility (crew+, space update, or public)"   (SELECT)
--   posts           "posts: insert (crew+ in scope or space-update comment)"       (INSERT)
--   post_reactions  "post_reactions: read (crew+ or space update)"                 (SELECT)
--   post_reactions  "post_reactions: insert own (crew+ or space update)"           (INSERT)
--   post_reactions  "post_reactions: delete own (feed or space update)"            (DELETE)
--
-- This migration recreates each policy as the SAME predicate MINUS that arm (every surviving arm
-- is a byte-faithful copy of the live pg_policies qual / with_check, read from production
-- 2026-08-20), renames each to stop describing an arm it no longer carries, then drops the helper.
-- Removing an OR arm from a permissive policy is a pure NARROWING: no row becomes visible or
-- writable that was not before.
--
-- WHY. The wall is gone (C3.4 deleted the route, components, 7 actions and 2 readers; the 308 from
-- C3.3 covers the URL) and the feature was never used once. Measured against production twice, 8
-- days apart (2026-08-12 and 2026-08-20, ADR-1091): 0 space_updates rows, 0 posts with
-- post_type = 'space_update' (0 top-level, 0 replies), 0 reactions on any of them. The arms
-- therefore serve NOTHING - and they are the widest read grant the feature carried. Leaving them
-- would let any future "Space wall" that reuses the space_update post type inherit a platform-wide
-- signed-in read grant by accident (CIRCLES-C3-PLAN §7.2). C3.5 exists to remove that footgun.
--
-- WHAT STILL READS THE TABLE. The space_updates TABLE and its own policies are untouched: it backs
-- the SpaceUpdates brand-blog block (a separately decided feature). Its app path never relied on
-- these arms - createSpaceUpdate / updateSpaceUpdate / deleteSpaceUpdate and getSpaceUpdates all go
-- through the service-role admin client (RLS bypass; lib/spaces/content-actions.ts,
-- lib/spaces/content-data.ts). The Update ANCHOR posts row (post_type = 'space_update',
-- visibility = 'public', parent_id null) stays readable exactly as any public top-level post:
-- signed-in members through the crew+ visibility arm, logged-out visitors through the anon arm.
-- The 'space_update' post_type enum value stays; anchors are still created.
--
-- PROOF. supabase/tests/space_update_rls_narrowing.test.sql (pgTAP, runs in CI db-tests against
-- the post-migration schema): the narrowed arms deny what they used to allow (a signed-in profile
-- with no community_role reads no space_update-shaped post and cannot reply or react; a member no
-- longer reads an out-of-circle group reply just because it hangs under an anchor) and the
-- surviving reads still work (anon + member read the public anchor, Circle group posts and
-- reactions are unaffected, delete-own-reaction survives on its own arm). Row evidence at apply
-- time: live pg_policies shows 0 references to is_space_update_post.
--
-- IDEMPOTENT: drop-if-exists (old and new names) then create; function drops are if-exists.
-- ROLLBACK (hand-review aid): recreate the helper from 20260918000300 (same body, in the private
-- schema, search_path 'public','private','pg_temp'), then recreate the 5 policies with the OR arms
-- exactly as 20261004000000 wrote them. Treat that as a last resort: re-adding a permissive arm by
-- hand is how grants drift (CIRCLES-C3-PLAN §6 marks this slice irreversible in practice).

-- ============================================================================================
-- post_reactions: 3 policies, each minus its space-update arm.
-- ============================================================================================

-- SELECT: crew+ read only.
drop policy if exists "post_reactions: read (crew+ or space update)" on public.post_reactions;
drop policy if exists "post_reactions: read (crew+)" on public.post_reactions;
create policy "post_reactions: read (crew+)"
  on public.post_reactions for select
  using (
    private.get_my_role() >= 'member'::community_role
  );

-- INSERT: crew+ insert own only.
drop policy if exists "post_reactions: insert own (crew+ or space update)" on public.post_reactions;
drop policy if exists "post_reactions: insert own (crew+)" on public.post_reactions;
create policy "post_reactions: insert own (crew+)"
  on public.post_reactions for insert
  with check (
    (private.get_my_role() >= 'member'::community_role)
    and (profile_id in (select profiles.id from profiles where (profiles.auth_user_id = (select auth.uid()))))
  );

-- DELETE: delete own only. The dropped arm (profile_id = get_my_profile_id() AND
-- is_space_update_post(post_id)) is textually narrower than this surviving arm, with ONE
-- effective exception CI found: a DELETE whose WHERE reads columns also needs the rows
-- SELECT-visible, and reaction reads are crew+ now - so a ROLELESS seat can no longer delete
-- its own space-update reaction. That seat can no longer create reactions either, and
-- production carried zero, so nothing strands (proven in the pgTAP suite).
drop policy if exists "post_reactions: delete own (feed or space update)" on public.post_reactions;
drop policy if exists "post_reactions: delete own" on public.post_reactions;
create policy "post_reactions: delete own"
  on public.post_reactions for delete
  using (
    profile_id in (select profiles.id from profiles where (profiles.auth_user_id = (select auth.uid())))
  );

-- ============================================================================================
-- posts: SELECT + INSERT, each minus its space-update arm.
-- ============================================================================================

-- SELECT: crew+ read by visibility OR anon public top-level read. Both arms verbatim from live.
drop policy if exists "posts: read by visibility (crew+, space update, or public)" on public.posts;
drop policy if exists "posts: read by visibility (crew+ or public)" on public.posts;
create policy "posts: read by visibility (crew+ or public)"
  on public.posts for select
  using (
    ((private.get_my_role() >= 'member'::community_role) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (((c.hub_id is not null) and (c.hub_id = any (private.get_my_hub_ids()))) or ((c.hub_id is null) and (c.topical_channel_id = any (private.get_my_tuned_channel_ids())))))))))))
    or (((select auth.uid()) is null) and (visibility = 'public'::post_visibility) and (parent_id is null))
  );

-- INSERT: crew+ insert in scope only. Verbatim from live.
drop policy if exists "posts: insert (crew+ in scope or space-update comment)" on public.posts;
drop policy if exists "posts: insert (crew+ in scope)" on public.posts;
create policy "posts: insert (crew+ in scope)"
  on public.posts for insert
  with check (
    (private.get_my_role() >= 'member'::community_role) and (author_id = private.get_my_profile_id()) and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (c.host_id = private.get_my_profile_id())))))))
  );

-- ============================================================================================
-- The helper. No policy references it any more (the drops above released the pg_depend edges),
-- and no function body ever called it (verified against pg_proc.prosrc, production 2026-08-20),
-- so the drop cannot dangle anything. It lives in private (20270101000000 moved it there; the
-- check:function-grants ledger records that move, which is why NO public-schema drop appears
-- here - the function left public via the schema move, never via a drop).
-- ============================================================================================

drop function if exists private.is_space_update_post(uuid);
