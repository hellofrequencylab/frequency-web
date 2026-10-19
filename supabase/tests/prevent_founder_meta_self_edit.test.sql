-- pgTAP behavioural guard for prevent_founder_meta_self_edit (migration 20270346009500,
-- SCAN-845): a member cannot change profiles.meta.founder, so wiping the first-week
-- record and reclaiming the Gems is refused at the database.
--
-- WHY THIS FILE EXISTS. The TypeScript side pins the WIRING (the migration shape, the
-- service-role stamp still used by claimFounderRewards). Only this file can pin the SQL:
-- that an authenticated PATCH, merge, or key-remove of founder is 42501; that other meta
-- keys still write; that claim_founder_flags as service_role still stamps.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a945-000000000001', 'founder-guard@test.local');

delete from public.profiles
 where auth_user_id = '00000000-0000-4000-a945-000000000001';

insert into public.profiles (id, auth_user_id, display_name, handle, meta) values
  ('00000000-0000-4000-b945-000000000001', '00000000-0000-4000-a945-000000000001', 'Founder Guard', 'founder-guard',
   '{"practiceStreak": {"current": 2}, "founder": {"rewarded": ["avatar"], "badge": true}}'::jsonb);

-- ── 0. Grants: trigger function is not an RPC ────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.prevent_founder_meta_self_edit()', 'execute'), false,
  'anon cannot execute prevent_founder_meta_self_edit');
select is(has_function_privilege('authenticated', 'public.prevent_founder_meta_self_edit()', 'execute'), false,
  'authenticated cannot execute prevent_founder_meta_self_edit');

-- ── 1. THE DEFECT: a member cannot wipe or rewrite the founder key ───────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a945-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ update public.profiles
        set meta = '{"practiceStreak": {"current": 2}, "founder": {}}'::jsonb
      where id = '00000000-0000-4000-b945-000000000001' $$,
  '42501',
  'founder once-only record cannot be modified by users',
  'a member PATCH that clears meta.founder is refused'
);

select throws_ok(
  $$ select public.merge_profile_meta(
       '00000000-0000-4000-b945-000000000001',
       '{"founder": {}}'::jsonb
     ) $$,
  '42501',
  'founder once-only record cannot be modified by users',
  'merge_profile_meta cannot replace founder as the member'
);

select throws_ok(
  $$ select public.remove_profile_meta_keys(
       '00000000-0000-4000-b945-000000000001',
       array['founder']
     ) $$,
  '42501',
  'founder once-only record cannot be modified by users',
  'remove_profile_meta_keys cannot drop founder as the member'
);

-- ── 2. Other meta keys stay member-writable ──────────────────────────────────────────────────
select lives_ok(
  $$ select public.merge_profile_meta(
       '00000000-0000-4000-b945-000000000001',
       '{"daily_checkin_date": "2026-10-19"}'::jsonb
     ) $$,
  'a member can still merge a key they own'
);
select is(
  (select meta -> 'founder' from public.profiles where id = '00000000-0000-4000-b945-000000000001'),
  '{"rewarded": ["avatar"], "badge": true}'::jsonb,
  'and the founder record is still there'
);
select is(
  (select meta ->> 'daily_checkin_date' from public.profiles where id = '00000000-0000-4000-b945-000000000001'),
  '2026-10-19',
  'the member-owned key landed'
);

-- ── 3. The service-role stamp still writes ───────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select is(
  public.claim_founder_flags('00000000-0000-4000-b945-000000000001', array['avatar', 'circle'], false),
  '{"added": ["circle"], "completing": false}'::jsonb,
  'claim_founder_flags as service_role still stamps a new task'
);
select is(
  (select meta -> 'founder' -> 'rewarded' from public.profiles where id = '00000000-0000-4000-b945-000000000001'),
  '["avatar", "circle"]'::jsonb,
  'the union is stored'
);
select is(
  (select meta ->> 'daily_checkin_date' from public.profiles where id = '00000000-0000-4000-b945-000000000001'),
  '2026-10-19',
  'the member-owned key survived the service-role stamp'
);

-- ── 4. A no-op founder write is not a change ─────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a945-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ update public.profiles
        set meta = meta || '{"daily_checkin_streak": 1}'::jsonb
      where id = '00000000-0000-4000-b945-000000000001' $$,
  'a member UPDATE that leaves founder untouched is allowed'
);

select * from finish();
rollback;
