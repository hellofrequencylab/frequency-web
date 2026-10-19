-- SCAN-846: a direct posts insert cannot forge a system line or hang a reply under a post the
-- member cannot see.
--
-- THE GAP. SCAN-680 and SCAN-682 were closed in createPost and createReply (app/(main)/feed/actions.ts)
-- only. The "posts: insert (crew+ in scope)" policy (20270317000000) checks the author, the role and
-- the visibility arm. It never constrains post_type, so a PostgREST insert with 'system', 'space_update'
-- or 'announcement' is accepted, and 'system' renders as an unattributed system line with no Report
-- menu (components/feed/post-card.tsx). It never checks parent_id either, so a public reply can sit
-- under a cluster post the member cannot see.
--
-- THE FIX. The same policy, same arms, plus two WITH CHECK terms: post_type in ('feed', 'note') and
-- parent_id is null. Every write the app makes for a member goes through the admin client
-- (createPost, createReply, announcements, polls, asks, Vera, the demo engine, system lines), which
-- the policy never binds, so the only inserts this narrows are forged ones. Replies keep their one
-- door (createReply, which checks the parent's scope); announcements keep their admin path.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346009700. Do not apply_migration. Do not db push.
--
-- ROLLBACK: recreate the policy body from 20270317000000 without the two added terms.
--
-- Idempotent (drop if exists, create). No em or en dashes. pgTAP: supabase/tests/posts_insert_member_guard.test.sql.

begin;

drop policy if exists "posts: insert (crew+ in scope)" on public.posts;
create policy "posts: insert (crew+ in scope)"
  on public.posts for insert
  with check (
    (private.get_my_role() >= 'member'::community_role)
    and (author_id = private.get_my_profile_id())
    -- SCAN-846: a member seat writes a plain post or a note, never a system line, a Space update or an
    -- announcement, and never a reply (replies go through createReply, which checks the parent's scope).
    and (post_type in ('feed'::post_type, 'note'::post_type))
    and (parent_id is null)
    and ((visibility = 'public'::post_visibility) or ((visibility = 'region'::post_visibility) and (scope_id = private.get_my_region_id())) or ((visibility = 'group'::post_visibility) and (scope_id = any (private.get_my_circle_ids()))) or ((visibility = 'cluster'::post_visibility) and ((scope_id = any (private.get_my_circle_ids())) or (exists (select 1 from circles c where ((c.id = posts.scope_id) and (c.host_id = private.get_my_profile_id())))))))
  );

comment on policy "posts: insert (crew+ in scope)" on public.posts is
  'A member inserts their own post in a scope they can see (20270317000000), as a plain post or a note with no parent (SCAN-846). System lines, Space updates, announcements, polls, asks and replies are written by the server through the admin client, never by a caller role.';

commit;
