-- ============================================================================
-- SEED THE PLATFORM FLAGS THE CODE READS BUT NO MIGRATION EVER INSERTED
-- (2026-09-05, scan2 L3-07 / L4-07).
-- ============================================================================
--
-- THE DEFECT. Eight platform_flags keys are read by the app and had no seed row
-- in any migration and no row live, so each reader's hardcoded fallback was the
-- only thing deciding, and the admin console had no row to show which default
-- was in force. A flag whose row does not exist cannot be audited either: the
-- first write lands in platform_flag_events with previous = null, and nothing
-- says whether the operator changed anything.
--
-- THE FIX. Insert each key with the SAME value its reader already defaults to,
-- so applying this changes no behaviour anywhere; it only makes the current
-- state visible and auditable. `on conflict (key) do nothing` so a row an
-- operator has since flipped is never clobbered by a re-run.
--
--   key                      value  reader (the default it mirrors)
--   auto_popups_enabled      false  lib/onboarding/flags.ts autoPopupsEnabled
--   next_steps_enabled       false  lib/onboarding/status.ts nextStepsEnabled
--   referrals_enabled        true   lib/platform-flags.ts referralsEnabled
--   sms_enabled              false  lib/platform-flags.ts smsEnabledFlag
--   vera_autonomy_enabled    false  lib/platform-flags.ts veraAutonomyEnabledFlag
--   vera_breaker_armed       true   lib/platform-flags.ts veraBreakerArmedFlag
--   host_payouts_enabled     false  lib/platform-flags.ts hostPayoutsEnabledFlag
--   chat_dm_routes_retired   false  lib/platform-flags.ts chatDmRoutesRetiredFlag
--
-- NOT SEEDED HERE, ON PURPOSE. marketplace_{market,housing,makers,shop}_published
-- stay unseeded: lib/marketplace/visibility.ts reads a missing row as published
-- (the marketplace is live), and a seeded true row would say the same thing while
-- inviting a reader to believe the row was an operator's choice.
--
-- Seeded-but-never-read keys (beta_referral_contest, beta_ends_at,
-- plan_whitelabel_enabled, plan_practitioner_enabled, plan_organization_enabled)
-- are left alone; a migration is not the place to delete history.
--
-- Additive + idempotent, safe to re-run. No grants change: platform_flags is
-- service-role only (RLS enabled, no client policies) and stays that way.
-- lib/platform-flags.test.ts walks every read key and fails on one this file
-- (or an earlier one) does not seed. No em or en dashes in this file.
-- ============================================================================

insert into public.platform_flags (key, value)
values
  ('auto_popups_enabled',    false),
  ('next_steps_enabled',     false),
  ('referrals_enabled',      true),
  ('sms_enabled',            false),
  ('vera_autonomy_enabled',  false),
  ('vera_breaker_armed',     true),
  ('host_payouts_enabled',   false),
  ('chat_dm_routes_retired', false)
on conflict (key) do nothing;

-- ROLLBACK NOTE. Deleting these rows returns every reader to its hardcoded
-- default, which is the same value, so a rollback is behaviour-neutral too:
--   delete from public.platform_flags where key in (
--     'auto_popups_enabled', 'next_steps_enabled', 'referrals_enabled',
--     'sms_enabled', 'vera_autonomy_enabled', 'vera_breaker_armed',
--     'host_payouts_enabled', 'chat_dm_routes_retired');
-- Only do that if no operator has flipped one of them since; check
-- platform_flag_events for the key first.
