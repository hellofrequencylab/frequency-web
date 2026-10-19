-- pgTAP behavioural guard for migration 20270346009700 (SCAN-846).
--
-- Before it, the "posts: insert (crew+ in scope)" policy accepted any post_type and any parent_id
-- from a member seat, so a PostgREST insert could forge an unattributed 'system' line or hang a
-- public reply under a post the member cannot see. Every forged write below is made AS a member
-- through the policy, the way PostgREST would make it, and must be refused; the plain post a member
-- may write directly still lands; and the server's own writes on the service role are untouched.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

-- ── Seed (as postgres, which RLS does not bind) ─────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a846-000000000001', 'pim-member@test.local'),
  ('00000000-0000-4000-a846-000000000002', 'pim-other@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b846-000000000001', '00000000-0000-4000-a846-000000000001', 'PIM Member', 'pim-member'),
  ('00000000-0000-4000-b846-000000000002', '00000000-0000-4000-a846-000000000002', 'PIM Other',  'pim-other');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids so
-- get_my_profile_id()'s scalar subquery has one answer.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a846-000000000001', '00000000-0000-4000-a846-000000000002')
  and id not in ('00000000-0000-4000-b846-000000000001', '00000000-0000-4000-b846-000000000002');

-- A public post by someone else: the parent a forged reply would hang under.
insert into public.posts (id, author_id, body, scope_id, visibility, post_type) values
  ('00000000-0000-4000-f846-000000000001', '00000000-0000-4000-b846-000000000002', 'PIM parent',
   '00000000-0000-4000-b846-000000000002', 'public', 'feed');

-- ── 1. The policy carries the two new terms ─────────────────────────────────────────────────────

select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'posts'
     and policyname = 'posts: insert (crew+ in scope)') ~ 'post_type',
  'the member insert policy constrains post_type');
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'posts'
     and policyname = 'posts: insert (crew+ in scope)') ~ 'parent_id IS NULL',
  'the member insert policy refuses a parent');

-- ── 2. Forged inserts, as the member ────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a846-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type)
     values ('00000000-0000-4000-b846-000000000001', 'forged system line',
             '00000000-0000-4000-b846-000000000001', 'public', 'system') $$,
  '42501', null,
  'a member cannot insert a system line');

select throws_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type)
     values ('00000000-0000-4000-b846-000000000001', 'forged announcement',
             '00000000-0000-4000-b846-000000000001', 'public', 'announcement') $$,
  '42501', null,
  'a member cannot insert an announcement directly');

select throws_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type)
     values ('00000000-0000-4000-b846-000000000001', 'forged space update',
             '00000000-0000-4000-b846-000000000001', 'public', 'space_update') $$,
  '42501', null,
  'a member cannot insert a Space update directly');

select throws_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type, parent_id)
     values ('00000000-0000-4000-b846-000000000001', 'forged reply',
             '00000000-0000-4000-b846-000000000002', 'public', 'feed', '00000000-0000-4000-f846-000000000001') $$,
  '42501', null,
  'a member cannot hang a reply under a post directly');

-- The plain post a member may still write through the policy.
select lives_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type)
     values ('00000000-0000-4000-b846-000000000001', 'a plain post',
             '00000000-0000-4000-b846-000000000001', 'public', 'feed') $$,
  'a member still inserts their own plain public post');

-- ── 3. The server's writes are untouched ────────────────────────────────────────────────────────

reset role;
select lives_ok(
  $$ insert into public.posts (author_id, body, scope_id, visibility, post_type, parent_id)
     values ('00000000-0000-4000-b846-000000000001', 'server-written reply',
             '00000000-0000-4000-b846-000000000002', 'public', 'feed', '00000000-0000-4000-f846-000000000001') $$,
  'a trusted role still writes a reply (createReply checks the parent scope in the app)');

select * from finish();
rollback;
