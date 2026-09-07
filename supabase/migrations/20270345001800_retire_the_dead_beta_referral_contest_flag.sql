-- ============================================================================
-- RETIRE THE LAST REMNANT OF THE BETA REFERRAL CONTEST (LIVE-166, 2026-09-07)
-- ============================================================================
--
-- THE DEFECT. `platform_flags.beta_referral_contest` is a master switch for a
-- feature that no longer exists. The contest was ruled out by the owner
-- (SCAN-511, ADR-1155); its code went in #2297 (lib/beta/referral-contest.ts,
-- the /referral route, both inline recorders), and its table went in
-- 20270339000000_drop_beta_referrals_the_contest_table.sql. The switch row is
-- what was left: seeded false by 20261123000000_beta_referrals.sql, read by
-- nothing since #2297, and shown on no operator surface.
--
-- A flag with no reader is worse than no flag. It renders as a control an
-- operator can flip, and flipping it does nothing at all -- the same
-- "mechanism outlives what it described" shape ADR-1083 records for the beta
-- countdown banner.
--
-- EVIDENCE READ LIVE, 2026-09-07, before this file was written:
--   * public.platform_flags holds 31 keys; `beta_referral_contest` is one of
--     them and its value is false.
--   * public.platform_flag_events holds ZERO rows for that key, so no operator
--     has ever flipped it. Nothing is being taken away from anybody.
--   * public.beta_referrals is already gone (20270339000000).
-- Nothing is lost by the delete, which is why no export step precedes it.
--
-- THE THREE COLLAPSED PLAN KEYS COME WITH IT, DEFENSIVELY. `plan_practitioner_enabled`,
-- `plan_organization_enabled` and `plan_whitelabel_enabled` were seeded by
-- 20260723010000_pricing_foundation.sql and deleted by
-- 20261016000000_collapse_space_plans_to_business_nonprofit.sql (ADR-552) -- but
-- that file's own header says "SHIP NOTE: FILE-ONLY (not yet applied)". They are
-- confirmed ABSENT from the live database, so this delete is a no-op there; it
-- exists so a fresh replay that somehow skips 20261016000000 still cannot leave
-- the pricing_foundation seed behind. Absent rows delete nothing.
--
-- 🔴 WHAT THIS FILE DELIBERATELY DOES NOT TOUCH. `beta_ends_at` is NOT a
-- platform_flags key and never was -- it is a text row in `platform_settings`
-- (live value "2026-10-31T23:59:59Z"), and ADR-1083 already ruled on it: "The
-- stale `beta_ends_at` value is inert and was not migrated." The announcement
-- banner gates on the MESSAGE, so a date with no message renders nothing. That
-- decision is not re-litigated here. Recorded so the next dead-key pass does not
-- re-find it and assume nobody looked.
--
-- This supersedes the note in 20270345000400_seed_missing_platform_flags.sql
-- ("a migration is not the place to delete history"). That was right about
-- HISTORY -- platform_flag_events is untouched below, and it is the history.
-- A live row for a deleted feature is state, not history.
--
-- No grants change: platform_flags is service-role only (RLS enabled, no client
-- policies) and stays that way. No function is created or dropped, so
-- scripts/function-grants.txt is unchanged. No em or en dashes in this file.
-- ============================================================================

begin;

delete from public.platform_flags
 where key in (
   'beta_referral_contest',
   'plan_practitioner_enabled',
   'plan_organization_enabled',
   'plan_whitelabel_enabled'
 );

do $$
begin
  -- NEGATIVE: the dead switch is gone.
  if exists (select 1 from public.platform_flags where key = 'beta_referral_contest') then
    raise exception 'platform_flags.beta_referral_contest survived the delete';
  end if;

  -- NEGATIVE: so are the three collapsed plan keys.
  if exists (
    select 1 from public.platform_flags
     where key in ('plan_practitioner_enabled', 'plan_organization_enabled', 'plan_whitelabel_enabled')
  ) then
    raise exception 'a collapsed plan flag survived the delete';
  end if;

  -- POSITIVE: the blast radius was exactly those keys. `beta_host_prompts` is the
  -- nearest neighbour by name (seeded by 20261124000000, an unrelated live surface);
  -- a `like 'beta%'` delete or a lost where-clause would take it, and this notices.
  if not exists (select 1 from public.platform_flags where key = 'beta_host_prompts') then
    raise exception 'platform_flags.beta_host_prompts is gone - the delete took more than the dead keys';
  end if;

  -- POSITIVE: and the table still holds the rest of the switchboard.
  if (select count(*) from public.platform_flags) < 20 then
    raise exception 'platform_flags is nearly empty - the delete took more than the dead keys';
  end if;

  -- POSITIVE: the audit ledger is untouched. platform_flag_events is the HISTORY of
  -- every toggle this platform has made; a cleanup that took it would be silent and
  -- unrecoverable, so assert the table is still there.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'platform_flag_events'
  ) then
    raise exception 'platform_flag_events is gone - the cleanup took the audit ledger';
  end if;
end $$;

commit;

-- ROLLBACK. Re-run the seed statements these keys came from:
-- 20261123000000_beta_referrals.sql for the contest switch, and
-- 20260723010000_pricing_foundation.sql for the three plan keys. All four seeded
-- false, so a rollback restores rows that nothing reads and changes no behaviour.
