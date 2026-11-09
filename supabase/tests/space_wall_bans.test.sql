-- ADR-1938 / LIVE-2095 proof (20270346030000_space_wall_bans_and_kinds.sql).
--
-- A wall ban puts one person out of one Space's wall and nothing else. This file proves, from both
-- directions and across two Spaces:
--   CATALOG  space_wall_bans has RLS on; authenticated holds SELECT and no other privilege; anon holds
--            none; the two new helpers are SECURITY DEFINER in `private`.
--   READ     the team reads the ban list; a plain member reads nothing; nobody but the service role writes it.
--   POST     a banned member cannot post on the wall that banned them, and still posts on another Space's
--            wall where they are a member in good standing; an unbanned member posts.
--   REACT    the same for reactions, through the post_reactions INSERT policy (a direct REST call).
--   KINDS    a member posts a poll; announcement is refused for a member and allowed for the team.
--
-- One transaction, rolled back. Fixture style follows space_community_wall.test.sql.

begin;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a401-000000000001', 'b-owner@test.local'),
  ('00000000-0000-4000-a401-000000000002', 'b-mod@test.local'),
  ('00000000-0000-4000-a401-000000000003', 'b-member@test.local'),
  ('00000000-0000-4000-a401-000000000004', 'b-banned@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b401-000000000001', '00000000-0000-4000-a401-000000000001', 'B Owner', 'b-owner', 'member'),
  ('00000000-0000-4000-b401-000000000002', '00000000-0000-4000-a401-000000000002', 'B Mod', 'b-mod', 'member'),
  ('00000000-0000-4000-b401-000000000003', '00000000-0000-4000-a401-000000000003', 'B Member', 'b-member', 'member'),
  ('00000000-0000-4000-b401-000000000004', '00000000-0000-4000-a401-000000000004', 'B Banned', 'b-banned', 'member');

-- trg_on_auth_user_created auto-provisions a profile per auth user: keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a401-000000000001', '00000000-0000-4000-a401-000000000002',
    '00000000-0000-4000-a401-000000000003', '00000000-0000-4000-a401-000000000004')
  and id not in (
    '00000000-0000-4000-b401-000000000001', '00000000-0000-4000-b401-000000000002',
    '00000000-0000-4000-b401-000000000003', '00000000-0000-4000-b401-000000000004');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c401-0000000000cc'::uuid, 'b-root', 'B Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- SA: the Space that bans. SB: another Space where the same person is a member in good standing.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c401-00000000000a', 'b-space-a', 'B Space A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b401-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c401-00000000000b', 'b-space-b', 'B Space B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b401-000000000001', 'active', 'network');

insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-b401-000000000002', 'moderator', 'active');
insert into public.space_membership_tiers (id, space_id, name, price_cents) values
  ('00000000-0000-4000-f401-000000000001', '00000000-0000-4000-c401-00000000000a', 'A Tier', 0),
  ('00000000-0000-4000-f401-000000000002', '00000000-0000-4000-c401-00000000000b', 'B Tier', 0);
insert into public.space_memberships (space_id, member_profile_id, tier_id, status) values
  ('00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-b401-000000000003', '00000000-0000-4000-f401-000000000001', 'active'),
  ('00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-b401-000000000004', '00000000-0000-4000-f401-000000000001', 'active'),
  ('00000000-0000-4000-c401-00000000000b', '00000000-0000-4000-b401-000000000004', '00000000-0000-4000-f401-000000000002', 'active');

-- WA: a wall post on SA by the owner. WB: a wall post on SB by the owner.
insert into public.posts (id, author_id, body, scope_id, scope_space_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f401-000000000011', '00000000-0000-4000-b401-000000000001', 'A owner post', '00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-c401-00000000000a', 'cluster', 'feed', null),
  ('00000000-0000-4000-f401-000000000012', '00000000-0000-4000-b401-000000000001', 'B owner post', '00000000-0000-4000-c401-00000000000b', '00000000-0000-4000-c401-00000000000b', 'cluster', 'feed', null);

-- The ban: B Banned is out of SA's wall only.
insert into public.space_wall_bans (space_id, profile_id, banned_by, reason) values
  ('00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-b401-000000000004', '00000000-0000-4000-b401-000000000002', 'test');

grant select, insert, update, delete on public.posts, public.post_reactions to anon, authenticated;
grant select on public.spaces, public.profiles, public.circles, public.memberships, public.space_members,
  public.space_memberships, public.space_follows, public.space_wall_settings to anon, authenticated;

-- ── CATALOG ───────────────────────────────────────────────────────────────────────────────────────
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'space_wall_bans'),
  'space_wall_bans has row level security on');

select ok(has_table_privilege('authenticated', 'public.space_wall_bans', 'select')
  and not has_table_privilege('authenticated', 'public.space_wall_bans', 'insert')
  and not has_table_privilege('authenticated', 'public.space_wall_bans', 'update')
  and not has_table_privilege('authenticated', 'public.space_wall_bans', 'delete')
  and not has_table_privilege('authenticated', 'public.space_wall_bans', 'truncate')
  and not has_table_privilege('authenticated', 'public.space_wall_bans', 'references'),
  'authenticated holds SELECT on space_wall_bans and no other privilege');

select ok(not has_table_privilege('anon', 'public.space_wall_bans', 'select'),
  'anon holds no privilege on space_wall_bans');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prosecdef
      and p.proname in ('is_banned_from_wall', 'can_react_on_post')),
  2::bigint, 'the two ban helpers are SECURITY DEFINER in private');

-- ── READ ──────────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a401-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq($$ select count(*)::int from space_wall_bans where space_id = '00000000-0000-4000-c401-00000000000a' $$, $$ values (1) $$,
  'the moderator rung reads the ban list');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a401-000000000003', 'role', 'authenticated')::text, true);
select results_eq($$ select count(*)::int from space_wall_bans where space_id = '00000000-0000-4000-c401-00000000000a' $$, $$ values (0) $$,
  'a plain member reads no ban row');
select throws_ok(
  $$ insert into space_wall_bans (space_id, profile_id) values ('00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-b401-000000000001') $$,
  '42501', null, 'a signed-in caller cannot write a ban');

-- ── POST ──────────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a401-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b401-000000000004', 'banned on A', '00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-c401-00000000000a', 'cluster', 'feed') $$,
  '42501', null, 'a banned member cannot post on the wall that banned them');
select lives_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b401-000000000004', 'fine on B', '00000000-0000-4000-c401-00000000000b', '00000000-0000-4000-c401-00000000000b', 'cluster', 'feed') $$,
  'the same person still posts on another Space''s wall');

-- ── REACT ─────────────────────────────────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into post_reactions (post_id, profile_id, reaction_type)
     values ('00000000-0000-4000-f401-000000000011', '00000000-0000-4000-b401-000000000004', '❤️') $$,
  '42501', null, 'a banned member cannot react on that wall''s posts');
select lives_ok(
  $$ insert into post_reactions (post_id, profile_id, reaction_type)
     values ('00000000-0000-4000-f401-000000000012', '00000000-0000-4000-b401-000000000004', '❤️') $$,
  'and still reacts on another Space''s wall');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a401-000000000003', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into post_reactions (post_id, profile_id, reaction_type)
     values ('00000000-0000-4000-f401-000000000011', '00000000-0000-4000-b401-000000000003', '❤️') $$,
  'an unbanned member reacts on the wall');

-- ── KINDS ─────────────────────────────────────────────────────────────────────────────────────────
select lives_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b401-000000000003', 'a poll', '00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-c401-00000000000a', 'cluster', 'poll') $$,
  'a member posts a poll on the wall');
select throws_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b401-000000000003', 'not mine to announce', '00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-c401-00000000000a', 'cluster', 'announcement') $$,
  '42501', null, 'a member cannot post an announcement');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a401-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b401-000000000002', 'from the team', '00000000-0000-4000-c401-00000000000a', '00000000-0000-4000-c401-00000000000a', 'cluster', 'announcement') $$,
  'the Space team posts an announcement');

select * from finish();
rollback;
