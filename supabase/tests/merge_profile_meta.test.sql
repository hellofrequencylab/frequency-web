-- pgTAP behavioural guard for merge_profile_meta / remove_profile_meta_keys (migration
-- 20270345000900): the one write primitive for profiles.meta (scan two L6-09, L5-06).
--
-- WHY THIS FILE EXISTS. Every profiles.meta writer used to rewrite the whole blob from a stale
-- read, so two writers for one member lost each other's key. The TypeScript side
-- (lib/profiles/meta.test.ts and each writer's test) pins the WIRING: that a writer calls the RPC
-- with ONLY its own key, and that a merge error stops the side effect that follows. Only this file
-- can pin the SQL: that the merge keeps the other writer's key, that two sequential patches of
-- different keys both survive, that the nested object is replaced at its top-level key (the
-- shallow contract the header of the migration states), that p_columns is an allowlist, and that
-- the wrong user is refused inside the function rather than by a grant alone.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(25);

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
-- profiles.auth_user_id carries a FOREIGN KEY to auth.users, and the owner check inside the RPC
-- joins on it, so the auth rows come first. trg_on_auth_user_created provisions a profile per
-- auth.users row; those are deleted so each auth id resolves to exactly the profile seeded here
-- (same idiom as circle_space_paid_members.test.sql).
insert into auth.users (id, email) values
  ('00000000-0000-4000-a900-000000000001', 'meta-owner@test.local'),
  ('00000000-0000-4000-a900-000000000002', 'meta-other@test.local');

delete from public.profiles
 where auth_user_id in ('00000000-0000-4000-a900-000000000001', '00000000-0000-4000-a900-000000000002');

insert into public.profiles (id, auth_user_id, display_name, handle, meta) values
  ('00000000-0000-4000-b900-000000000001', '00000000-0000-4000-a900-000000000001', 'Meta Owner', 'meta-owner',
   '{"practiceStreak": {"current": 2, "freezeTokens": 1}, "daily_checkin_date": "2026-09-04"}'::jsonb),
  ('00000000-0000-4000-b900-000000000002', '00000000-0000-4000-a900-000000000002', 'Meta Other', 'meta-other',
   null);

-- ── 0. Grants: signed-in and service callers may execute, anon may not ─────────────────────────
select is(has_function_privilege('anon', 'public.merge_profile_meta(uuid, jsonb, jsonb)', 'execute'), false,
  'anon cannot execute merge_profile_meta');
select is(has_function_privilege('authenticated', 'public.merge_profile_meta(uuid, jsonb, jsonb)', 'execute'), true,
  'authenticated can execute merge_profile_meta (the function itself checks ownership)');
select is(has_function_privilege('service_role', 'public.merge_profile_meta(uuid, jsonb, jsonb)', 'execute'), true,
  'service_role can execute merge_profile_meta');
select is(has_function_privilege('anon', 'public.remove_profile_meta_keys(uuid, text[])', 'execute'), false,
  'anon cannot execute remove_profile_meta_keys');
select is(has_function_privilege('authenticated', 'public.remove_profile_meta_keys(uuid, text[])', 'execute'), true,
  'authenticated can execute remove_profile_meta_keys');

-- ── 1. As the service role (the admin client), the merge keeps the other writer's key ─────────
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

select is(
  public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{"walkthroughs": {"welcome": {"seenAt": "t"}}}'::jsonb)
    -> 'practiceStreak' ->> 'current',
  '2',
  'merging the walkthroughs key keeps the practiceStreak key another writer owns'
);
select is(
  (select meta ->> 'daily_checkin_date' from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  '2026-09-04',
  'and keeps the daily_checkin_date key too'
);

-- ── 2. Two sequential patches of different keys both survive (the interleaving that lost data) ──
select lives_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{"daily_checkin_date": "2026-09-05", "daily_checkin_streak": 3}'::jsonb) $$,
  'the check-in stamps its own two keys'
);
select lives_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{"practiceStreak": {"current": 3, "freezeTokens": 1, "lastDay": "2026-09-05"}}'::jsonb,
       '{"current_streak": 3, "longest_streak": 3}'::jsonb) $$,
  'the streak writes its own key plus the two mirror columns'
);
select is(
  (select meta ->> 'daily_checkin_date' from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  '2026-09-05',
  'the check-in date written first is still there after the streak write'
);
select is(
  (select meta -> 'practiceStreak' ->> 'current' from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  '3',
  'and the streak written second is there too'
);
select is(
  (select meta -> 'walkthroughs' -> 'welcome' ->> 'seenAt' from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  't',
  'and the walkthrough stamp from section 1 survived both'
);
select is(
  (select current_streak from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  3,
  'p_columns set current_streak in the same statement'
);
select is(
  (select longest_streak from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  3,
  'p_columns set longest_streak in the same statement'
);

-- ── 3. The merge is SHALLOW: a nested object is replaced at its top-level key, not deep-merged ──
select is(
  public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{"practiceStreak": {"current": 4}}'::jsonb)
    -> 'practiceStreak' ->> 'freezeTokens',
  null::text,
  'a nested object is replaced whole at its key (freezeTokens is gone), which is the stated contract: a writer sends its complete key'
);

-- ── 4. p_columns is an allowlist, not a column writer ─────────────────────────────────────────
select throws_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{}'::jsonb, '{"lifetime_gems": 999999}'::jsonb) $$,
  '42501',
  'merge_profile_meta: column not allowed: lifetime_gems',
  'a column outside the streak-mirror allowlist is refused, even for the service role'
);
select throws_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '"not an object"'::jsonb) $$,
  '22023',
  'merge_profile_meta: patch must be a JSON object',
  'a non-object patch is refused rather than corrupting the column'
);
select throws_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-0000000000ff', '{"x": 1}'::jsonb) $$,
  'P0002',
  'merge_profile_meta: profile not found',
  'an unknown profile is an error, not a silent no-op'
);

-- ── 5. A null meta starts from {} ─────────────────────────────────────────────────────────────
select is(
  public.merge_profile_meta('00000000-0000-4000-b900-000000000002', '{"leaderboardOptOut": true}'::jsonb),
  '{"leaderboardOptOut": true}'::jsonb,
  'a profile whose meta is null gets the patch as its whole meta'
);

-- ── 6. The signed-in owner may write their own row, and NOBODY else's ─────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a900-000000000001', 'role', 'authenticated')::text, true);

select is(
  public.merge_profile_meta('00000000-0000-4000-b900-000000000001', '{"headerFocal": "30% 40%"}'::jsonb) ->> 'headerFocal',
  '30% 40%',
  'the owner (auth.uid() = profiles.auth_user_id) merges their own meta'
);
select throws_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000002', '{"headerFocal": "0% 0%"}'::jsonb) $$,
  '42501',
  'merge_profile_meta: not your profile',
  'the wrong user is refused inside the function'
);
select throws_ok(
  $$ select public.remove_profile_meta_keys('00000000-0000-4000-b900-000000000002', array['leaderboardOptOut']) $$,
  '42501',
  'remove_profile_meta_keys: not your profile',
  'and refused on the delete half too'
);

-- ── 7. remove_profile_meta_keys drops the named keys and keeps the rest (still as the owner) ───
select is(
  public.remove_profile_meta_keys('00000000-0000-4000-b900-000000000001', array['headerFocal', 'not_present']) ? 'headerFocal',
  false,
  'the delete returns the meta without the removed key'
);

-- Back to the harness role for the catalog reads below, so RLS on profiles cannot make an
-- assertion pass by hiding the row (a null from a hidden row would read as "unchanged").
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select is(
  (select meta ->> 'headerFocal' from public.profiles where id = '00000000-0000-4000-b900-000000000002'),
  null::text,
  'the refused write changed nothing'
);
select is(
  (select (meta ? 'headerFocal') = false and (meta ? 'practiceStreak') and (meta ? 'daily_checkin_date')
     from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  true,
  'headerFocal is gone and the other writers'' keys are untouched'
);

select * from finish();
rollback;
