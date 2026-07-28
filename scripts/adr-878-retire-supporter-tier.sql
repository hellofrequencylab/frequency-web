-- ADR-878 · RETIRE THE $12 SUPPORTER TIER FROM THE SELLABLE MEMBER LADDER
--
-- The founder's canonical member ladder is exactly Member (free) and Crew ($9/mo). Supporter had
-- already stopped being a TIER (ADR-458 turned it into the pay-what-you-want `profiles.is_supporter`
-- badge); this removes what was left of it as something we SELL and SHOW, and clears the crossed-out
-- $12 anchor that sat over Crew's $9 (that anchor only ever echoed the $12 Supporter rate).
--
-- WHO THIS AFFECTS: nobody. Verified against prod before writing: ZERO profiles carry
-- membership_tier = 'supporter' and ZERO carry is_supporter = true. Nothing here touches a profile.
--
-- WHAT IT DOES (three idempotent statements):
--   1. platform_flags.tier_supporter_enabled -> false. The code already refuses to sell Supporter
--      regardless of this flag (lib/pricing/settings.ts memberTierSellable), so this is the braces to
--      that belt: the stored operator state stops disagreeing with the product.
--   2. pricing_settings 'tier.supporter' -> DELETED. The row is no longer read by anything
--      (PricingDefaults['tier'] carries Crew alone), so leaving it would be a $12 number sitting in the
--      config for a future reader to find and trust.
--   3. pricing_settings 'tier.crew' -> strip `list_cents`, so Crew renders one plain $9.
--
-- THE GUARD (mirrors 20270115000000_pricing_beta_anchors.sql). Statement 3 only rewrites a row still
-- holding the exact known pre-change anchor (list_cents = 1200). An operator who has deliberately set
-- a different anchor at /admin/pricing keeps it, exactly as the beta-anchor migration refused to
-- clobber operator-set rates. Re-running any statement is a no-op.
--
-- DO NOT RUN FROM A BUILD STEP. This is an operator script for the main session to apply by hand, and
-- it is deliberately NOT in supabase/migrations/ (it changes operator CONFIG rows, not schema).
-- Nothing here charges anyone: billing_live gates every money path independently.

-- ── VERIFY BEFORE ───────────────────────────────────────────────────────────────────────────────
-- Expect: tier_supporter_enabled = true, a tier.supporter row, and tier.crew carrying list_cents 1200.

select 'BEFORE flag' as check, key, value
  from public.platform_flags
 where key = 'tier_supporter_enabled';

select 'BEFORE settings' as check, key, value
  from public.pricing_settings
 where key in ('tier.supporter', 'tier.crew')
 order by key;

-- Expect 0 rows on both counts (the reason this is safe at all).
select 'BEFORE affected members' as check,
       count(*) filter (where membership_tier = 'supporter') as supporter_tier_rows,
       count(*) filter (where is_supporter) as supporter_badge_rows
  from public.profiles;

-- ── 1. Turn the sell flag off ───────────────────────────────────────────────────────────────────
-- Idempotent by value: a second run writes the same false and changes nothing observable.
-- `platform_flags.value` is a plain boolean column (20260603000001), and the row is guaranteed to
-- exist (seeded by 20260723010000, set true by 20261217000000), so an upsert keeps this replay-safe
-- even against a database where it was never seeded.
insert into public.platform_flags (key, value)
values ('tier_supporter_enabled', false)
on conflict (key) do update set value = false, updated_at = now();

-- ── 2. Delete the retired tier.supporter price row ──────────────────────────────────────────────
-- Nothing reads this key any more; deleting it is what stops a $12 member price existing in config.
delete from public.pricing_settings
 where key = 'tier.supporter';

-- ── 3. Clear Crew's struck $12 anchor ───────────────────────────────────────────────────────────
-- GUARDED: only a row still holding the exact pre-change anchor (1200) is rewritten, so a deliberate
-- operator anchor set at /admin/pricing survives. Idempotent: once list_cents is gone the WHERE no
-- longer matches.
update public.pricing_settings
   set value = value - 'list_cents',
       updated_at = now()
 where key = 'tier.crew'
   and (value ->> 'list_cents')::int = 1200;

-- ── VERIFY AFTER ────────────────────────────────────────────────────────────────────────────────
-- Expect: the flag reads false, NO tier.supporter row, and tier.crew with monthly_cents 900,
-- annual_cents 9000, and no list_cents key at all.

select 'AFTER flag' as check, key, value
  from public.platform_flags
 where key = 'tier_supporter_enabled';

select 'AFTER settings' as check, key, value, (value ? 'list_cents') as has_anchor
  from public.pricing_settings
 where key in ('tier.supporter', 'tier.crew')
 order by key;

-- The one-line pass/fail. Expect: supporter_row_gone = t, crew_anchor_cleared = t, flag_off = t.
select
  not exists (select 1 from public.pricing_settings where key = 'tier.supporter') as supporter_row_gone,
  not exists (
    select 1 from public.pricing_settings where key = 'tier.crew' and value ? 'list_cents'
  ) as crew_anchor_cleared,
  exists (
    select 1 from public.platform_flags
     where key = 'tier_supporter_enabled' and value is false
  ) as flag_off;
