-- pgTAP behavioural guard for merge_profile_meta / remove_profile_meta_keys (migration
-- 20270345000900): the one write primitive for profiles.meta (scan two L6-09, L5-06), and for
-- merge_profile_meta_path (migration 20270345002300, LIVE-171 / ADR-1235): the merge INSIDE a key
-- several writers share, so two of them cannot revert each other one level down.
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
select plan(36);

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
select is(has_function_privilege('anon', 'public.merge_profile_meta_path(uuid, text[], jsonb)', 'execute'), false,
  'anon cannot execute merge_profile_meta_path');
select is(has_function_privilege('authenticated', 'public.merge_profile_meta_path(uuid, text[], jsonb)', 'execute'), true,
  'authenticated can execute merge_profile_meta_path (the function itself checks ownership)');

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

-- ── 3b. merge_profile_meta_path merges INSIDE a shared key (LIVE-171) ─────────────────────────
-- The race 0900 left open: a janitor unpublishing and an owner setting a theme both used to send the
-- whole `spotlight` sub-object from their own read, so the second write carried the first field as
-- it was BEFORE the first write. Each now sends only its field, and both survive.
select lives_ok(
  $$ select public.merge_profile_meta('00000000-0000-4000-b900-000000000001',
       '{"spotlight": {"enabled": true, "published": true, "theme": {"accent": "old"}}}'::jsonb) $$,
  'fixture: a spotlight key with three fields'
);
select is(
  public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array['spotlight'], '{"published": false}'::jsonb)
    -> 'spotlight',
  '{"enabled": true, "published": false, "theme": {"accent": "old"}}'::jsonb,
  'the janitor sends only published:false and the owner''s enabled + theme survive'
);
select is(
  public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array['spotlight'], '{"theme": {"accent": "new"}}'::jsonb)
    -> 'spotlight',
  '{"enabled": true, "published": false, "theme": {"accent": "new"}}'::jsonb,
  'the owner sends only the theme and the janitor''s published:false written a moment ago survives'
);
select is(
  (select meta -> 'practiceStreak' ->> 'current' from public.profiles where id = '00000000-0000-4000-b900-000000000001'),
  '4',
  'and the top-level keys other writers own are untouched by a path merge'
);
select is(
  public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array['tour'], '{"spotlight": {"status": "paused"}}'::jsonb)
    -> 'tour',
  '{"spotlight": {"status": "paused"}}'::jsonb,
  'a missing key at the path is created rather than silently skipped (jsonb_set alone would write nothing)'
);
select is(
  public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array['tour', 'spotlight'], '{"atStop": 3}'::jsonb)
    #> '{tour,spotlight}',
  '{"status": "paused", "atStop": 3}'::jsonb,
  'a two-element path merges two levels down and keeps the sibling field'
);
select is(
  public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array['deep', 'er'], '{"x": 1}'::jsonb) #> '{deep,er}',
  '{"x": 1}'::jsonb,
  'every missing ancestor is materialised so the merge always lands'
);
select throws_ok(
  $$ select public.merge_profile_meta_path('00000000-0000-4000-b900-000000000001', array[]::text[], '{"x": 1}'::jsonb) $$,
  '22023',
  'merge_profile_meta_path: path must name at least one key',
  'an empty path is refused rather than treated as a top-level merge'
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
select throws_ok(
  $$ select public.merge_profile_meta_path('00000000-0000-4000-b900-000000000002', array['spotlight'], '{"published": true}'::jsonb) $$,
  '42501',
  'merge_profile_meta_path: not your profile',
  'and refused on the path half: a member cannot publish another member''s Spotlight'
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
