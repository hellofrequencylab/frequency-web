-- 🔴 A PROPOSAL, NOT A MIGRATION, AND NOT A SCHEMA CHANGE. Nothing below has been executed.
--
-- ⚠️ DO NOT MOVE THIS FILE TO supabase/migrations/. It is DML (it deletes data rows), not DDL.
-- A migration asserts "every fresh environment must replay this", and replaying a one-off cleanup
-- of operator state on a fresh database is meaningless at best. Run it once, against production,
-- then delete this file. check:migrations governs the schema ledger; this never enters it.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────────────────────────
--
-- `pricing_stripe_prices` holds 40 rows and EVERY ONE of them points at the Stripe SANDBOX. Each
-- stripe_price_id carries the sandbox account fragment `PUaeZ72k09`; the live account is
-- acct_1TdurHPhyalyRPP1 (fragment `PhyalyRPP1`), and on 2026-08-19 GET /v1/products and
-- GET /v1/prices against it both returned `data: []` — it has never held a single billing object.
--
-- So not one row in this table resolves to anything a live customer could be charged against. The
-- catalog sync at /admin/pricing will overwrite 20 of the 40 by key; the other 20 (16 retired
-- legacy-axis keys + 4 operator_seat keys the sync deliberately skips) would be left behind still
-- holding dead sandbox ids. Clearing the table first means the post-sync contents are EXACTLY what
-- the sync wrote, which is the only state that is trivially verifiable.
--
-- ── WHY THIS IS SAFE — measured against production 2026-08-19, all zero ─────────────────────────
--
--   profiles.locked_price_id IS NOT NULL ................. 0
--   profiles.stripe_customer_id IS NOT NULL .............. 0
--   space_subscription_items (any row at all) ............ 0
--   space_subscription_items.locked_price_id NOT NULL .... 0
--   spaces.stripe_subscription_id IS NOT NULL ............ 0
--   spaces.stripe_customer_id IS NOT NULL ................ 0
--   space_memberships.stripe_subscription_id NOT NULL .... 0
--   space_membership_tiers.stripe_product_id NOT NULL .... 0
--
-- Nothing in the database references a price id. Nobody has ever checked out. There is no
-- grandfathered lock to preserve, because a lock is written by a successful Stripe checkout and
-- there have been none.
--
-- ── WHAT SURVIVES, AND WHY IT SURVIVES ──────────────────────────────────────────────────────────
--
-- Temple of Aset (slug `templeofaset`, IshAset Lumi) carries `spaces.beta_price_grant = true`,
-- granted 2026-08-18, plus a cash billing agreement (Collective, annual, $490, paid through
-- 2027-07-27). NEITHER is touched here, and neither depends on a row in this table:
--
--   * The grant is a BOOLEAN on `spaces`. At checkout `loadoutChargeArm` (lib/pricing/beta.ts)
--     resolves it to the founding arm, which looks up the price by the KEY NAME
--     `collective_base_month` / `collective_base_year` — not by a stored id. Re-syncing writes live
--     ids under those same key names, so the grant re-points itself at the live $49/$490 founding
--     price with no further action. This is only true because the sync preserves key names; if a key
--     is ever renamed, the grant silently falls through to list. (ADR-1061, ADR-1062.)
--   * The cash agreement lives in `space_billing_agreements` and never touches Stripe at all.
--
-- ── RUN IT IN THIS ORDER. All three steps. ──────────────────────────────────────────────────────
--
--   1. Confirm the safety check below still returns all zeros. If ANY count is non-zero, STOP:
--      someone has checked out since this was measured, and a lock now needs preserving.
--   2. Run the DELETE.
--   3. Go to /admin/pricing and press "Sync the catalog to Stripe" (NOT "Sync legacy products").
--      Then run the verification at the bottom: it must return exactly 20 rows, and every
--      stripe_price_id must be free of the sandbox fragment `PUaeZ72k09`.
--
-- Verified against production (azsqfeonabsbmemvddqd) 2026-08-19.


-- ── STEP 1 · SAFETY CHECK. Every column must read 0. ────────────────────────────────────────────
select
  (select count(*) from profiles                where locked_price_id        is not null) as profiles_locked,
  (select count(*) from profiles                where stripe_customer_id     is not null) as profile_customers,
  (select count(*) from space_subscription_items)                                         as sub_items_total,
  (select count(*) from spaces                  where stripe_subscription_id is not null) as spaces_subscribed,
  (select count(*) from spaces                  where stripe_customer_id     is not null) as spaces_customers,
  (select count(*) from space_memberships       where stripe_subscription_id is not null) as memberships_subscribed,
  (select count(*) from space_membership_tiers  where stripe_product_id      is not null) as tiers_with_product;


-- ── STEP 2 · CLEAR THE MAP. 40 rows, all of them sandbox. ──────────────────────────────────────
-- Deliberately unfiltered: there is no row worth keeping. Every id in this table is a sandbox id,
-- and the sync rebuilds the live ones by key immediately afterwards.
delete from pricing_stripe_prices;


-- ── STEP 3 · VERIFY, AFTER the catalog sync has run. ───────────────────────────────────────────
-- Expect exactly 20 rows: business_base, collective_base, independent_base, nonprofit_seat and
-- addon_ai, each with month / month_list / year / year_list. operator_seat is CORRECTLY absent —
-- it is an unapproved placeholder that the sync skips until `catalog_operator_seat_active` is
-- flipped on, and its absence keeps resolveLoadoutPriceId returning null (ADR-799/803).
--
--   select count(*) as rows_total,
--          count(*) filter (where stripe_price_id like '%PUaeZ72k09%') as still_sandbox
--     from pricing_stripe_prices;
--   -- expect: rows_total = 20, still_sandbox = 0
--
--   select key, stripe_price_id from pricing_stripe_prices order by key;
