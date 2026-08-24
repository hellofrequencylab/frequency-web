-- pgTAP behavioural guard for award_zaps_atomic (migration 20270322000000): the Zap half of
-- daily_cap enforcement.
--
-- WHY THIS FILE EXISTS. `zap_config.daily_cap` was never read. lib/zaps.ts selected
-- `zaps_amount, is_active` and inserted unconditionally, while /admin/gamification let a janitor
-- set a cap — a switch that gated nothing, reading as coverage (ADR-970). Two production rows
-- carried an inert cap when the fix landed: practice_logged (12 Zaps, cap 1) and event_posted
-- (20 Zaps, cap 3).
--
-- The TypeScript side (lib/zaps.test.ts) pins the WIRING: which columns are read, what is passed
-- to the RPC, and that the failure direction is closed. Only this file can pin the SQL, because
-- only here is the transaction, the clock and the advisory lock real. A cap that has only ever
-- been checked against a mock is the "gate that has never seen a real artifact" that AGENTS.md
-- names.
--
-- ⚠️ WHAT THIS FILE DOES **NOT** COVER, stated so it cannot read as coverage (ADR-970): THE
-- ADVISORY LOCK. pgTAP runs in ONE session inside ONE transaction, so removing
-- `pg_advisory_xact_lock` from the migration leaves every assertion below GREEN — measured, not
-- assumed. The lock is the entire reason this RPC exists (the Gem path's count-then-insert
-- over-paid past the cap), and it can only be proved with concurrent sessions. It was, before this
-- landed: eight simultaneous calls at cap 1 wrote 1 ledger row with the lock and 8 without it
-- (84 Zaps over-paid). If you ever weaken the locking here, re-run that, because nothing in this
-- file will stop you.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(20);

-- The day boundary assertions below must be able to tell UTC midnight from LOCAL midnight, so the
-- session runs in a zone with a NON-ZERO offset. award_zaps_atomic pins search_path but not
-- TimeZone, so it inherits this — which is exactly the condition under which a `date_trunc('day',
-- now())` (no `at time zone 'UTC'`) would silently be a local-day cap.
set local timezone = 'America/Los_Angeles';

-- profiles.id carries no auth FK, so bare uuids are fine (same idiom as household_bundle_seating).
insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-0000-0000-00000000c001', 'Capped',  'zap_capped'),
  ('00000000-0000-0000-0000-00000000c002', 'Other',   'zap_other');

-- ── 1. A cap of 1 pays the first award of the UTC day ─────────────────────────────────────────
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c001', 'practice_logged', 12, 1, '{}'::jsonb) ->> 'awarded'),
  'true',
  'the first award of the day is paid under a cap of 1'
);
select is(
  (select count(*)::int from public.zap_transactions
    where profile_id = '00000000-0000-0000-0000-00000000c001' and action_type = 'practice_logged'),
  1,
  'and it wrote exactly one ledger row'
);
select is(
  (select amount from public.zap_transactions
    where profile_id = '00000000-0000-0000-0000-00000000c001' and action_type = 'practice_logged'),
  12,
  'for the amount it was handed'
);

-- ── 2. The SECOND award of the same UTC day is refused, and refused for real ──────────────────
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c001', 'practice_logged', 12, 1, '{}'::jsonb) ->> 'awarded'),
  'false',
  'the second award of the day is refused once the cap is spent'
);
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c001', 'practice_logged', 12, 1, '{}'::jsonb) ->> 'capped'),
  'true',
  'and it says capped, so a caller can tell a cap refusal from an error'
);
select is(
  (select count(*)::int from public.zap_transactions
    where profile_id = '00000000-0000-0000-0000-00000000c001' and action_type = 'practice_logged'),
  1,
  'and NO extra ledger row was written — the refusal is the insert not happening, not a flag'
);

-- ── 3. The cap is per (profile, action) ──────────────────────────────────────────────────────
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'practice_logged', 12, 1, '{}'::jsonb) ->> 'awarded'),
  'true',
  'another profile at the same cap is unaffected'
);
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c001', 'event_posted', 20, 3, '{}'::jsonb) ->> 'awarded'),
  'true',
  'a different action for the SAME profile is unaffected'
);

-- ── 4. A NULL cap means UNCAPPED, exactly as it does for Gems ────────────────────────────────
select is(
  (select (count(*) filter (where (public.award_zaps_atomic(
      '00000000-0000-0000-0000-00000000c001', 'node_capture', 10, null, '{}'::jsonb) ->> 'awarded') = 'true'))::int
   from generate_series(1, 5)),
  5,
  'a null cap pays every time — five awards, five payments'
);
select is(
  (select count(*)::int from public.zap_transactions
    where profile_id = '00000000-0000-0000-0000-00000000c001' and action_type = 'node_capture'),
  5,
  'and five ledger rows landed'
);

-- ── 5. A cap of ZERO is a real setting, not "unlimited" ──────────────────────────────────────
-- This is the `?? null` vs `|| null` trap on the TypeScript side, pinned here on the SQL side too.
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'outreach_task', 20, 0, '{}'::jsonb) ->> 'capped'),
  'true',
  'a cap of 0 refuses the very first award'
);
select is(
  (select count(*)::int from public.zap_transactions
    where profile_id = '00000000-0000-0000-0000-00000000c002' and action_type = 'outreach_task'),
  0,
  'and writes nothing'
);

-- ── 6. A non-positive amount is a no-op, before the lock is even taken ───────────────────────
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'welcome_back', 0, null, '{}'::jsonb) ->> 'awarded'),
  'false',
  'a zero amount awards nothing even when uncapped'
);

-- ── 7. THE DAY BOUNDARY IS UTC, NOT LOCAL ───────────────────────────────────────────────────
-- Two probes, one second either side of UTC midnight, with the session in America/Los_Angeles.
-- Only a boundary at exactly UTC midnight passes BOTH: a local-day rule puts the boundary 7 or 8
-- hours away, which either sweeps both probes in (test 7b fails) or leaves both out (7a fails).
delete from public.zap_transactions where profile_id = '00000000-0000-0000-0000-00000000c002';

insert into public.zap_transactions (profile_id, action_type, amount, created_at)
values ('00000000-0000-0000-0000-00000000c002', 'event_attend', 25,
        (date_trunc('day', (now() at time zone 'UTC')) at time zone 'UTC') - interval '1 second');
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'event_attend', 25, 1, '{}'::jsonb) ->> 'awarded'),
  'true',
  '7a: a row ONE SECOND BEFORE UTC midnight belongs to yesterday and does not spend today''s cap'
);

delete from public.zap_transactions where profile_id = '00000000-0000-0000-0000-00000000c002';
insert into public.zap_transactions (profile_id, action_type, amount, created_at)
values ('00000000-0000-0000-0000-00000000c002', 'event_attend', 25,
        (date_trunc('day', (now() at time zone 'UTC')) at time zone 'UTC') + interval '1 second');
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'event_attend', 25, 1, '{}'::jsonb) ->> 'capped'),
  'true',
  '7b: a row ONE SECOND AFTER UTC midnight is today and does spend it'
);

-- ── 8. A reversal does NOT hand the day's allowance back ─────────────────────────────────────
-- Stated rather than discovered later: reverseZaps debits under a *_reversed action_type, so the
-- count for the awarded action is unchanged. Gems has no debit primitive at all; this is the
-- closest mirror available, and it is a conscious choice.
insert into public.zap_transactions (profile_id, action_type, amount)
values ('00000000-0000-0000-0000-00000000c002', 'practice_log_reversed', -12);
select is(
  (public.award_zaps_atomic('00000000-0000-0000-0000-00000000c002', 'event_attend', 25, 1, '{}'::jsonb) ->> 'capped'),
  'true',
  'a reversal row under a different action_type does not refund the allowance'
);

-- ── 9. Grants: service_role only (ADR-959 — both the PUBLIC grant and the per-role grants) ───
select ok(
  not has_function_privilege('anon', 'public.award_zaps_atomic(uuid, text, integer, integer, jsonb)', 'EXECUTE'),
  'anon cannot execute award_zaps_atomic'
);
select ok(
  not has_function_privilege('authenticated', 'public.award_zaps_atomic(uuid, text, integer, integer, jsonb)', 'EXECUTE'),
  'authenticated cannot execute award_zaps_atomic'
);
select ok(
  has_function_privilege('service_role', 'public.award_zaps_atomic(uuid, text, integer, integer, jsonb)', 'EXECUTE'),
  'service_role can execute award_zaps_atomic'
);

-- ── 10. The index the cap-count reads exists ─────────────────────────────────────────────────
-- The count runs while HOLDING the per-(profile, action) lock, so a sequential scan there is
-- contention, not just latency. gem_transactions has carried its twin since the Gem cap shipped.
select has_index('public', 'zap_transactions', 'idx_zap_transactions_daily',
  'zap_transactions carries the (profile_id, action_type, created_at) index the cap-count reads');

select * from finish();
rollback;
