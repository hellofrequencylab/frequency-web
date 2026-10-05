-- pgTAP behavioural guard for migration 20270345011800 (SCAN-774).
--
-- The qr_codes insert-own / update-own policies check ownership alone, so before this migration a
-- member could insert, from the browser, a code with destination_type = 'circle' and any circle_id
-- (a self-minted invite into a paid or invite-only Circle) or stamp space_id + purpose = 'lead' onto
-- a code (a lead-grab door into another Space's CRM). Every forged write below is made AS a member
-- through the policy, exactly the way PostgREST would make it, and must be refused with a privilege
-- error; the write the app makes for a member (ensureMemberCodes' personal-code upsert) and the
-- cosmetic edits the update-own policy was written for must still land; and the service role, which
-- every operator and Space writer uses, must be untouched.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(16);

-- ── Seed (as postgres, which RLS does not bind) ─────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a774-000000000001', 'qrc-member@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b774-000000000001', '00000000-0000-4000-a774-000000000001', 'QRC Member', 'qrc-member');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed id so
-- get_my_profile_id()'s scalar subquery has one answer.
delete from public.profiles
where auth_user_id = '00000000-0000-4000-a774-000000000001'
  and id <> '00000000-0000-4000-b774-000000000001';

-- ── 1. The grant surface, read straight off the catalog ─────────────────────────────────────────

select is(has_table_privilege('authenticated', 'public.qr_codes', 'insert'), false,
  'authenticated holds no table-wide insert on qr_codes');
select is(has_table_privilege('authenticated', 'public.qr_codes', 'update'), false,
  'authenticated holds no table-wide update on qr_codes');
select is(has_table_privilege('anon', 'public.qr_codes', 'insert'), false,
  'anon holds no insert on qr_codes');
select is(has_column_privilege('authenticated', 'public.qr_codes', 'circle_id', 'insert'), false,
  'authenticated cannot insert circle_id');
select is(has_column_privilege('authenticated', 'public.qr_codes', 'space_id', 'insert'), false,
  'authenticated cannot insert space_id');
select is(has_column_privilege('authenticated', 'public.qr_codes', 'circle_id', 'update'), false,
  'authenticated cannot update circle_id');
select is(has_column_privilege('authenticated', 'public.qr_codes', 'purpose', 'update'), false,
  'authenticated cannot update purpose');
select is(has_column_privilege('authenticated', 'public.qr_codes', 'owner_profile_id', 'insert'), true,
  'authenticated can still insert owner_profile_id (the personal-code upsert needs it)');

-- ── 2. Forged writes, as the member ─────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a774-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.qr_codes (slug, title, destination_type, circle_id, owner_profile_id, created_by)
     values ('qrc-forged-circle', 'Sneak in', 'circle', '00000000-0000-4000-c774-000000000001',
             '00000000-0000-4000-b774-000000000001', '00000000-0000-4000-b774-000000000001') $$,
  '42501', null,
  'a member cannot mint a circle code (circle_id is not theirs to write)');

select throws_ok(
  $$ insert into public.qr_codes (slug, title, destination_type, target_url, purpose, space_id, owner_profile_id, created_by)
     values ('qrc-forged-lead', 'Lead grab', 'url', 'https://example.test', 'lead', '00000000-0000-4000-d774-000000000001',
             '00000000-0000-4000-b774-000000000001', '00000000-0000-4000-b774-000000000001') $$,
  '42501', null,
  'a member cannot stamp space_id onto a code');

-- The write the app makes for a member: ensureMemberCodes' personal-code upsert, column for column.
select lives_ok(
  $$ insert into public.qr_codes (slug, title, destination_type, target_url, purpose, owner_profile_id, created_by, style)
     values ('qrc-connect', 'My personal code', 'url', 'https://frequencylocal.com/', 'connect',
             '00000000-0000-4000-b774-000000000001', '00000000-0000-4000-b774-000000000001', '{}'::jsonb)
     on conflict (owner_profile_id, purpose) do nothing $$,
  'a member provisions their own personal code through the policy');

select throws_ok(
  $$ update public.qr_codes set circle_id = '00000000-0000-4000-c774-000000000001', destination_type = 'circle'
      where slug = 'qrc-connect' $$,
  '42501', null,
  'a member cannot retarget their own code at a circle');

select throws_ok(
  $$ update public.qr_codes set purpose = 'lead' where slug = 'qrc-connect' $$,
  '42501', null,
  'a member cannot turn their own code into a lead-grab door');

select lives_ok(
  $$ update public.qr_codes set title = 'Renamed', active = false where slug = 'qrc-connect' $$,
  'a member still renames and deactivates their own code');

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select coalesce(circle_id::text, 'null') || '/' || coalesce(purpose, 'null') || '/' || title
     from public.qr_codes where slug = 'qrc-connect'),
  'null/connect/Renamed',
  'after every forged write the row is still a plain personal code');

-- ── 3. The service role is untouched ────────────────────────────────────────────────────────────
-- The role the admin client's requests arrive as: the QR studio, Space codes and entry points.

set local role service_role;
select lives_ok(
  $$ update public.qr_codes set purpose = null, target_url = null where slug = 'qrc-connect' $$,
  'the service role still writes every column');
reset role;

select * from finish();
rollback;
