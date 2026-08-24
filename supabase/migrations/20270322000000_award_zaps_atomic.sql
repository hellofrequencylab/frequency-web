-- ⚠️ NOT YET APPLIED. Authored 2026-08-24; production has NOT run this file, and no zap_config
-- row was touched. Apply it with the two-step protocol in supabase/migrations/README.md (apply,
-- then repair the ledger to THIS version). Until it is applied, `pnpm check:migrations` Rule 4
-- reports this file as `unpairedRepo` whenever it is armed with credentials — that is the guard
-- working, not a defect, and it clears on apply.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Make `zap_config.daily_cap` mean something. It has never been read.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG. lib/zaps.ts `awardZapsForAction` selected `zaps_amount, is_active` and nothing
-- else, and `awardZaps` inserted into `zap_transactions` unconditionally. The string `daily_cap`
-- appeared ZERO times in lib/zaps.ts. Meanwhile /admin/gamification
-- (app/(main)/admin/gamification/reward-actions.ts) has always let a janitor set a cap on a Zap
-- action, and even validates it carefully — a present-but-invalid cap is rejected rather than
-- silently becoming NULL. So the operator set a throttle, the UI confirmed it, and the award
-- engine never asked. That is ADR-970's named failure exactly: a switch that gates nothing reads
-- as coverage.
--
-- MEASURED on production (azsqfeonabsbmemvddqd) 2026-08-24, before writing a line of this file:
-- 23 `zap_config` rows, all `is_active`, TWO of them carrying an inert cap —
--   practice_logged  12 Zaps  daily_cap 1
--   event_posted     20 Zaps  daily_cap 3
-- Both caps start being enforced the moment the TypeScript half of this change ships. This is a
-- real, member-visible reduction in earnings, not a silent bugfix. See the impact note below.
--
-- WHY AN RPC AND NOT A COUNT-THEN-INSERT IN TYPESCRIPT. Because that shape is a race, and this
-- repo has already paid for learning it once. `award_gems_atomic` (20260929000000) exists BECAUSE
-- the JS count-then-insert over-paid: N concurrent awards at cap-1 all read the same count and all
-- inserted. This file is that migration's shape, copied deliberately rather than re-derived —
-- per-(profile, action) advisory xact lock, UTC day boundary, cap-check and insert inside one
-- serialized section. Do not "simplify" it back into two statements.
--
-- ── WHAT THIS CAPS, AND WHAT IT DELIBERATELY DOES NOT (read before trusting the cap) ───────────
--
-- The cap binds on `awardZapsForAction` ONLY — the config-driven entry point, which is the exact
-- mirror of gems, where `awardGems` is the only entry point there is. `awardZaps(profileId,
-- amount, opts)` is the dynamic-amount sibling with NO config row behind it (a node's own
-- zaps_value, a partial practice log, a finish top-up delta), and it still inserts directly.
--
-- Two consequences, both stated rather than discovered later:
--   1. An `awardZaps` row still COUNTS toward the day's allowance, because this function counts
--      ledger rows by action_type and does not care which code path wrote them. With
--      practice_logged at cap 1, the first practice_logged row of the member's UTC day — of ANY
--      kind — spends the whole allowance.
--   2. `reverseZaps` writes its debit under a DIFFERENT action_type ('practice_log_reversed',
--      'welcome_back_reversed'), so un-logging a practice does NOT hand the day's allowance back.
--      Gems has no debit primitive at all, so this is the closest mirror available; it is a
--      conscious choice, not an oversight.
--
-- ROLLBACK: drop function if exists public.award_zaps_atomic(uuid, text, integer, integer, jsonb);
--           drop index if exists public.idx_zap_transactions_daily;
--           (and revert lib/zaps.ts — the function going missing makes awardZapsForAction fail
--           CLOSED, i.e. it awards nothing, which is loud rather than silently uncapped.)

-- ── The index the cap-count reads ─────────────────────────────────────────────────────────────
-- gem_transactions has carried idx_gem_transactions_daily (profile_id, action_type, created_at)
-- since the gem cap shipped; zap_transactions never needed it because nothing ever counted.
-- Adding it is part of mirroring the Gem path: the count below runs while HOLDING a per-(profile,
-- action) lock, so a sequential scan there is contention, not just latency. Not CONCURRENTLY —
-- migrations run in a transaction, and zap_transactions is small (hundreds of rows today).
create index if not exists idx_zap_transactions_daily
  on public.zap_transactions using btree (profile_id, action_type, created_at);

-- ── The RPC ───────────────────────────────────────────────────────────────────────────────────
-- Returns jsonb { awarded, capped }. SECURITY DEFINER + pinned search_path; callable only by
-- service_role (awardZapsForAction runs behind app-code authz via the admin client).
--
-- search_path is pinned to '' rather than gems' `public` — the stricter, newer house convention
-- (20270219000000_node_capture_counts_rpc). Every reference below is schema-qualified, so the
-- behaviour is identical to award_gems_atomic; only the blast radius of a hostile schema differs.
create or replace function public.award_zaps_atomic(
  _profile    uuid,
  _action     text,
  _amount     integer,
  _daily_cap  integer,
  _metadata   jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count     integer;
  v_day_start timestamptz := (date_trunc('day', (now() at time zone 'UTC')) at time zone 'UTC');
begin
  if _amount is null or _amount <= 0 then
    return jsonb_build_object('awarded', false, 'capped', false);
  end if;

  -- Serialize awards for this (profile, action): concurrent calls block here until the holder
  -- commits, so the count below sees their insert and the cap can't be exceeded.
  perform pg_advisory_xact_lock(hashtextextended(_profile::text || ':' || _action, 0));

  -- A NULL cap means UNCAPPED, exactly as it does for gems — no count is taken at all.
  if _daily_cap is not null then
    select count(*) into v_count
    from public.zap_transactions
    where profile_id = _profile and action_type = _action and created_at >= v_day_start;

    if v_count >= _daily_cap then
      return jsonb_build_object('awarded', false, 'capped', true);
    end if;
  end if;

  insert into public.zap_transactions (profile_id, action_type, amount, metadata)
  values (_profile, _action, _amount, coalesce(_metadata, '{}'::jsonb));

  return jsonb_build_object('awarded', true, 'capped', false);
end;
$$;

comment on function public.award_zaps_atomic(uuid, text, integer, integer, jsonb) is
  'Zap award with an atomic daily_cap check: per-(profile, action) advisory xact lock, UTC day boundary, cap-check and insert in one serialized section. The mirror of award_gems_atomic (20260929000000). NULL _daily_cap means uncapped. Called only by lib/zaps.awardZapsForAction through the service-role admin client; SECURITY DEFINER, service_role only.';

-- ── Grants ────────────────────────────────────────────────────────────────────────────────────
-- BOTH revokes in THIS statement, not just one. Postgres grants EXECUTE on a new function to the
-- pseudo-role PUBLIC, and Supabase's ALTER DEFAULT PRIVILEGES adds SEPARATE explicit per-role
-- grants to anon + authenticated. Either revoke alone leaves the other satisfying
-- has_function_privilege(), i.e. a revoke that runs, succeeds, and locks nothing (ADR-959;
-- supabase/migrations/fail-open-guards.test.ts enforces exactly this pairing).
revoke all on function public.award_zaps_atomic(uuid, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.award_zaps_atomic(uuid, text, integer, integer, jsonb) to service_role;

-- ── VERIFY AFTER APPLYING (ask the catalog, never this file) ──────────────────────────────────
--
--   select has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as svc
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'award_zaps_atomic';
--
-- Expected: anon false, authenticated false, service_role true.
