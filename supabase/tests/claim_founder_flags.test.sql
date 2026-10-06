-- pgTAP behavioural guard for claim_founder_flags (migration 20270345011800, SCAN-759): the
-- compare-and-set that stamps profiles.meta.founder under the row lock and returns ONLY what this
-- call claimed, so the founder Gems are paid once however many claims overlap.
--
-- WHY THIS FILE EXISTS. The TypeScript side (app/(main)/founder/founder-actions.test.ts) pins the
-- WIRING: that the action pays for `added` and `completing` as the RPC reports them, and nothing
-- when the RPC fails. Only this file can pin the SQL: that a second claim of the same task returns
-- added=[], that the badge completes exactly once, that the other writers' keys survive, that the
-- shape is tolerant of a missing or malformed founder key, and that the grant is service_role only.
--
-- ⚠️ WHAT THIS FILE DOES NOT COVER, stated so it cannot read as coverage (ADR-970): the ROW LOCK
-- under concurrency. pgTAP runs in one session inside one transaction, so a `for update` removed
-- from the migration leaves every assertion below green. The sequential second-claim assertions
-- are the single-session shadow of that guarantee; the lock itself can only be proved with two
-- sessions.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(20);

-- ── Fixture (same idiom as merge_profile_meta.test.sql) ────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a901-000000000001', 'founder-one@test.local'),
  ('00000000-0000-4000-a901-000000000002', 'founder-two@test.local');

delete from public.profiles
 where auth_user_id in ('00000000-0000-4000-a901-000000000001', '00000000-0000-4000-a901-000000000002');

insert into public.profiles (id, auth_user_id, display_name, handle, meta) values
  ('00000000-0000-4000-b901-000000000001', '00000000-0000-4000-a901-000000000001', 'Founder One', 'founder-one',
   '{"practiceStreak": {"current": 2}, "founder": {"rewarded": ["avatar"], "badge": false}}'::jsonb),
  ('00000000-0000-4000-b901-000000000002', '00000000-0000-4000-a901-000000000002', 'Founder Two', 'founder-two',
   null);

-- ── 0. Grants: service_role only ───────────────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.claim_founder_flags(uuid, text[], boolean)', 'execute'), false,
  'anon cannot execute claim_founder_flags');
select is(has_function_privilege('authenticated', 'public.claim_founder_flags(uuid, text[], boolean)', 'execute'), false,
  'authenticated cannot execute claim_founder_flags');
select is(has_function_privilege('service_role', 'public.claim_founder_flags(uuid, text[], boolean)', 'execute'), true,
  'service_role can execute claim_founder_flags');

-- ── 1. The function refuses a non-service caller inside the body too ──────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a901-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['circle'], false) $$,
  '42501',
  'claim_founder_flags: service role only',
  'the owner of the profile is still refused: this is the admin client''s seam, not the member''s'
);

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

-- ── 2. The first claim stamps and reports exactly the new tasks ───────────────────────────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['avatar', 'circle', 'post'], false),
  '{"added": ["circle", "post"], "completing": false}'::jsonb,
  'avatar was already rewarded, so only circle and post are added'
);
select is(
  (select meta -> 'founder' -> 'rewarded' from public.profiles where id = '00000000-0000-4000-b901-000000000001'),
  '["avatar", "circle", "post"]'::jsonb,
  'the stamp is the union, in order'
);
select is(
  (select meta -> 'practiceStreak' ->> 'current' from public.profiles where id = '00000000-0000-4000-b901-000000000001'),
  '2',
  'the practiceStreak key another writer owns survived'
);

-- ── 3. THE DEFECT: the second tab claims the same tasks and gets NOTHING to pay ───────────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['avatar', 'circle', 'post'], false),
  '{"added": [], "completing": false}'::jsonb,
  'the same claim again adds nothing, so the caller pays nothing (SCAN-759)'
);

-- ── 4. Completion stamps the badge exactly once ───────────────────────────────────────────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['avatar', 'circle', 'post', 'event'], true),
  '{"added": ["event"], "completing": true}'::jsonb,
  'the completing call reports completing=true once'
);
select is(
  (select meta -> 'founder' -> 'badge' from public.profiles where id = '00000000-0000-4000-b901-000000000001'),
  'true'::jsonb,
  'and the badge is stamped'
);
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['avatar', 'circle', 'post', 'event'], true),
  '{"added": [], "completing": false}'::jsonb,
  'a second completing call reports completing=false: the bonus is paid once'
);

-- ── 5. A claim that adds nothing writes nothing ───────────────────────────────────────────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array[]::text[], false),
  '{"added": [], "completing": false}'::jsonb,
  'an empty task list is a no-op'
);
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', null, null),
  '{"added": [], "completing": false}'::jsonb,
  'null arguments are a no-op, not an error'
);

-- ── 6. Duplicates in one call are stamped once ────────────────────────────────────────────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000001', array['profile', 'profile'], false),
  '{"added": ["profile"], "completing": false}'::jsonb,
  'a task repeated in one call is added once'
);

-- ── 7. A profile whose meta is null, or whose founder key is malformed, starts from {} ────────
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000002', array['avatar'], false),
  '{"added": ["avatar"], "completing": false}'::jsonb,
  'a null meta claims from an empty rewarded list'
);
select is(
  (select meta from public.profiles where id = '00000000-0000-4000-b901-000000000002'),
  '{"founder": {"rewarded": ["avatar"], "badge": false}}'::jsonb,
  'and the founder key is materialised whole'
);
update public.profiles set meta = '{"founder": "garbage"}'::jsonb where id = '00000000-0000-4000-b901-000000000002';
select is(
  public.claim_founder_flags('00000000-0000-4000-b901-000000000002', array['circle'], true),
  '{"added": ["circle"], "completing": true}'::jsonb,
  'a non-object founder key is treated as empty rather than raising'
);
select is(
  (select meta -> 'founder' from public.profiles where id = '00000000-0000-4000-b901-000000000002'),
  '{"rewarded": ["circle"], "badge": true}'::jsonb,
  'and replaced with a well-formed one'
);

-- ── 8. Errors are errors, not silent no-ops ───────────────────────────────────────────────────
select throws_ok(
  $$ select public.claim_founder_flags('00000000-0000-4000-b901-0000000000ff', array['avatar'], false) $$,
  'P0002',
  'claim_founder_flags: profile not found',
  'an unknown profile is an error'
);
select throws_ok(
  $$ select public.claim_founder_flags(null, array['avatar'], false) $$,
  '22023',
  'claim_founder_flags: profile id is required',
  'a null profile id is refused'
);

select * from finish();
rollback;
