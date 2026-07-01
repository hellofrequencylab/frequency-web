-- Member-level interaction on Space Updates (Puck content blocks, Phase 2, ADR-476/472; owner
-- decision 2026-07-01). ANY signed-in member (free members included) may REACT and COMMENT on a
-- Space's brand Updates. The community feed's Crew+ gate on posts/post_reactions stays EXACTLY as it
-- is; this migration ONLY carves a member-level path for posts whose thread roots at a
-- post_type = 'space_update' anchor. Normal feed posts and comments are untouched: a free member
-- still cannot author a normal feed post or comment, react on a normal post, or read a private-circle
-- post. Every policy added here is guarded on is_space_update_post(...) so the carve-out cannot leak.
--
-- WHY A NEW PATH. A Space Update reuses the existing reactions/comments plumbing by anchoring to a
-- public.posts row (space_updates.post_id) with post_type = 'space_update'; members react through
-- public.post_reactions(post_id) and comment through public.posts(parent_id). But the base feed RLS
-- (20240101000001 / 20240102000000 / 20240104000000) gates posts + post_reactions read/insert on
-- get_my_role() >= 'crew'. A free member therefore could not react or comment on an Update through a
-- session client. These ADDITIVE policies grant that, tightly scoped to the space_update thread.
--
-- HOUSE STYLE (mirrors the helper style in 20260902000000 / 20260818000000): SECURITY DEFINER helper
-- with a pinned search_path, resolved via get_my_profile_id() (NEVER raw auth.uid()). Additive +
-- idempotent (create or replace function; drop policy if exists then create). No em or en dashes in
-- any comment or string (CONTENT-VOICE). Reached untyped from app code (ADR-246).
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply
-- path. Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- == Prerequisites already present (referenced, never recreated): public.posts (id, parent_id,
--    post_type, author_id, scope_id, visibility, hidden_at), public.post_reactions (post_id,
--    profile_id, reaction_type), public.get_my_profile_id(). The 'space_update' post_type value is
--    added in 20260918000100 (a separate txn, since a new enum value cannot be used in the txn that
--    adds it). space_updates.post_id (the anchor link) is added in 20260918000200.

-- == Helper: does this post belong to a Space Update thread? ======================================
-- True when the post IS a space_update anchor, OR its parent chain roots at one (so a comment, or a
-- reply to a comment, in an Update's thread qualifies too). SECURITY DEFINER so the walk reads posts
-- without re-entering its RLS; pinned search_path per convention. Bounded walk (the Update comment
-- thread is at most 2 levels, but the recursive walk is depth-capped defensively at 10 to prevent a
-- pathological chain from spinning). Returns false for a null / unknown post.
create or replace function public.is_space_update_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with recursive chain as (
    select id, parent_id, post_type, 1 as depth
    from public.posts
    where id = p_post_id
    union all
    select p.id, p.parent_id, p.post_type, c.depth + 1
    from public.posts p
    join chain c on p.id = c.parent_id
    where c.depth < 10
  )
  select exists (select 1 from chain where post_type = 'space_update');
$function$;

comment on function public.is_space_update_post(uuid) is
  'Puck content blocks Phase 2 (owner decision 2026-07-01): true when the post is a space_update anchor or roots at one (its thread). Used ONLY to grant member-level (free member) react + comment on Space Updates, tightly scoped so the community feed Crew+ gate is untouched. SECURITY DEFINER, pinned search_path, depth-capped walk.';

revoke all on function public.is_space_update_post(uuid) from public;
grant execute on function public.is_space_update_post(uuid) to authenticated, anon;

-- == post_reactions: member-level react on space_update posts =====================================
-- ADDITIVE policies (they sit BESIDE the existing crew+ policies; RLS is permissive, so a row is
-- allowed if ANY policy passes). Scoped to space_update posts, so they never widen reactions on a
-- normal feed post. A member reads reactions on an Update, toggles their OWN reaction, and removes it.
drop policy if exists "post_reactions: member read on space update" on public.post_reactions;
create policy "post_reactions: member read on space update"
  on public.post_reactions for select
  using (
    public.get_my_profile_id() is not null
    and public.is_space_update_post(post_id)
  );

drop policy if exists "post_reactions: member insert own on space update" on public.post_reactions;
create policy "post_reactions: member insert own on space update"
  on public.post_reactions for insert
  with check (
    profile_id = public.get_my_profile_id()
    and public.is_space_update_post(post_id)
  );

drop policy if exists "post_reactions: member delete own on space update" on public.post_reactions;
create policy "post_reactions: member delete own on space update"
  on public.post_reactions for delete
  using (
    profile_id = public.get_my_profile_id()
    and public.is_space_update_post(post_id)
  );

-- == posts: member-level read + comment on space_update threads ===================================
-- ADDITIVE. A member READS a space_update anchor + every comment in its thread (so the block can show
-- the Update and its replies), and INSERTS a COMMENT (a reply: parent_id set, and the parent roots at
-- a space_update). The insert is a COMMENT ONLY: parent_id MUST be non-null and MUST itself be part of
-- a space_update thread, so this path can never author a top-level post of any kind. author_id must be
-- the caller (no forging). post_type is forced to 'feed' by the app action, but even a crafted request
-- cannot escape the parent-thread guard.
drop policy if exists "posts: member read space update thread" on public.posts;
create policy "posts: member read space update thread"
  on public.posts for select
  using (
    public.get_my_profile_id() is not null
    and hidden_at is null
    and public.is_space_update_post(id)
  );

drop policy if exists "posts: member comment on space update" on public.posts;
create policy "posts: member comment on space update"
  on public.posts for insert
  with check (
    author_id = public.get_my_profile_id()
    and parent_id is not null
    and public.is_space_update_post(parent_id)
  );

-- A member edits / deletes their OWN comment in a space_update thread (the base feed policy already
-- lets an author update/delete their own post via author_id = get_my_profile_id(), so no new
-- update/delete policy is strictly required; we intentionally add NONE here to avoid widening beyond
-- the base author-owns-own rule).

-- == Rollback (hand-review aid) ===================================================================
-- Additive; no existing policy is altered or dropped, so a rollback only removes what this file added:
--   1. drop policy if exists "posts: member comment on space update"          on public.posts;
--   2. drop policy if exists "posts: member read space update thread"         on public.posts;
--   3. drop policy if exists "post_reactions: member delete own on space update" on public.post_reactions;
--   4. drop policy if exists "post_reactions: member insert own on space update" on public.post_reactions;
--   5. drop policy if exists "post_reactions: member read on space update"    on public.post_reactions;
--   6. drop function if exists public.is_space_update_post(uuid);
-- The community feed Crew+ gate is never touched, so reverting restores the exact prior posture.
