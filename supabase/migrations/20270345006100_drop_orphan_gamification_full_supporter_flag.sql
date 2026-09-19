-- ============================================================================
-- DROP THE ORPHAN gamification_full_supporter FLAG (HYG-078 / ADR-1434)
-- ============================================================================
--
-- THE DEFECT. platform_flags.gamification_full_supporter is a stored boolean
-- that no code reads. ADR-1106 dropped the key from PRICING_FLAG_KEYS on
-- 2026-08-24 when the Supporter RUNG left EntitlementTier. GAMIFICATION_FLAG
-- is keyed by that union, so no tier can select the flag. loadPricingFlags
-- filters on PRICING_FLAG_KEYS, so the stored row is unread. A switch an
-- operator cannot see and nothing consults is the "dead switch reads as
-- coverage" failure.
--
-- THE SEED ALSO RECREATED IT. 20260723010000_pricing_foundation.sql used to
-- insert the key on greenfield replay (on conflict do nothing, so production
-- kept the original true). Stopping the seed is not enough for a database
-- that already applied that file. This delete is the production half.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH.
--   * tier_supporter_enabled stays. supporter-retired.test.ts loads every
--     flag ON to prove memberTierSellable('supporter') still refuses.
--     Deleting that key would make the guard vacuous (ADR-970).
--   * lib/billing/supporter.ts, profiles.is_supporter, and the PWYW
--     contribution charge stay. Those are the badge, not this flag.
--   * platform_flag_events is history and is not deleted.
--
-- No grants change. platform_flags is service-role only (RLS enabled, no
-- client write policy). No function is created or dropped. No em or en
-- dashes in this file.
-- ============================================================================

begin;

delete from public.platform_flags
 where key = 'gamification_full_supporter';

do $$
begin
  -- NEGATIVE: the orphan is gone.
  if exists (
    select 1 from public.platform_flags where key = 'gamification_full_supporter'
  ) then
    raise exception 'platform_flags.gamification_full_supporter survived the delete';
  end if;

  -- POSITIVE: the neighbour that is still a live per-role override stays.
  if not exists (
    select 1 from public.platform_flags where key = 'gamification_full_crew'
  ) then
    raise exception 'platform_flags.gamification_full_crew is gone - the delete took more than the orphan';
  end if;

  -- POSITIVE: the sell-path guard HYG-078 must keep stays.
  if not exists (
    select 1 from public.platform_flags where key = 'tier_supporter_enabled'
  ) then
    raise exception 'platform_flags.tier_supporter_enabled is gone - the delete took the sell-path guard';
  end if;

  -- POSITIVE: the table still holds the rest of the switchboard.
  if (select count(*) from public.platform_flags) < 20 then
    raise exception 'platform_flags is nearly empty - the delete took more than the orphan';
  end if;

  -- POSITIVE: the audit ledger is untouched.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'platform_flag_events'
  ) then
    raise exception 'platform_flag_events is gone - the cleanup took the audit ledger';
  end if;
end $$;

commit;

-- ROLLBACK. Re-inserting the row restores an unread switch. Do not do that.
-- The seed in 20260723010000 no longer creates it, so a greenfield replay
-- after this file stays clean without a compensating insert.
