-- pgTAP behavioural guard for migration 20270346001400 (SCAN-812).
--
-- friendships_freeze_identity() was SECURITY DEFINER, so current_user inside it was always postgres
-- and its trusted-writer branch let every member through. Each forged write below is made AS the
-- addressee through the update policy, the way PostgREST would make it, and must be refused with
-- 42501 by the trigger; the accept the app makes must still land.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(6);

-- ── Seed (as postgres, which RLS does not bind) ─────────────────────────────────────────────────
-- Requester A < third party C < addressee B < fourth party D, so the real pair (A, B) and both
-- forged pairs (C, B) and (B, D) satisfy friendships_canonical_order.

insert into auth.users (id, email) values
  ('00000000-0000-4000-a812-000000000001', 'ffi-requester@test.local'),
  ('00000000-0000-4000-a812-000000000002', 'ffi-third@test.local'),
  ('00000000-0000-4000-a812-000000000003', 'ffi-addressee@test.local'),
  ('00000000-0000-4000-a812-000000000004', 'ffi-fourth@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b812-000000000001', '00000000-0000-4000-a812-000000000001', 'FFI Requester', 'ffi-requester'),
  ('00000000-0000-4000-b812-000000000002', '00000000-0000-4000-a812-000000000002', 'FFI Third',     'ffi-third'),
  ('00000000-0000-4000-b812-000000000003', '00000000-0000-4000-a812-000000000003', 'FFI Addressee', 'ffi-addressee'),
  ('00000000-0000-4000-b812-000000000004', '00000000-0000-4000-a812-000000000004', 'FFI Fourth',    'ffi-fourth');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids so
-- the policy's profile subquery has one answer.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a812-000000000001', '00000000-0000-4000-a812-000000000002',
                       '00000000-0000-4000-a812-000000000003', '00000000-0000-4000-a812-000000000004')
  and id not in ('00000000-0000-4000-b812-000000000001', '00000000-0000-4000-b812-000000000002',
                 '00000000-0000-4000-b812-000000000003', '00000000-0000-4000-b812-000000000004');

insert into public.friendships (id, user_a_id, user_b_id, requested_by, status) values
  ('00000000-0000-4000-f812-000000000001', '00000000-0000-4000-b812-000000000001',
   '00000000-0000-4000-b812-000000000003', '00000000-0000-4000-b812-000000000001', 'pending');

-- ── 1. The function is an invoker function ──────────────────────────────────────────────────────

select is(
  (select prosecdef from pg_proc where oid = 'public.friendships_freeze_identity()'::regprocedure),
  false,
  'friendships_freeze_identity is not SECURITY DEFINER');

-- ── 2. Forged updates, as the addressee ─────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a812-000000000003', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.friendships
        set status = 'accepted',
            user_a_id = '00000000-0000-4000-b812-000000000002',
            requested_by = '00000000-0000-4000-b812-000000000002'
      where id = '00000000-0000-4000-f812-000000000001' $$,
  '42501', null,
  'the addressee cannot swap the requester for a third profile while accepting');

select throws_ok(
  $$ update public.friendships
        set status = 'accepted',
            user_a_id = '00000000-0000-4000-b812-000000000003',
            user_b_id = '00000000-0000-4000-b812-000000000004',
            requested_by = '00000000-0000-4000-b812-000000000004'
      where id = '00000000-0000-4000-f812-000000000001' $$,
  '42501', null,
  'the addressee cannot re-point the friendship at a different pair while accepting');

-- ── 3. The accept the app makes still lands ─────────────────────────────────────────────────────

select lives_ok(
  $$ update public.friendships
        set status = 'accepted', responded_at = now()
      where id = '00000000-0000-4000-f812-000000000001' $$,
  'the addressee can still accept the request');

reset role;

select is(
  (select status from public.friendships where id = '00000000-0000-4000-f812-000000000001'),
  'accepted',
  'the accept landed');

select ok(
  (select user_a_id = '00000000-0000-4000-b812-000000000001'
      and user_b_id = '00000000-0000-4000-b812-000000000003'
      and requested_by = '00000000-0000-4000-b812-000000000001'
     from public.friendships where id = '00000000-0000-4000-f812-000000000001'),
  'the identity triple is unchanged');

select * from finish();
rollback;
