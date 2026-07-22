-- PRICING ADMIN GAPS (ADR-803) — the data rows behind the pricing config that moved from database-only
-- editing onto real /admin/pricing surfaces: the operator-seat activation switch and the `founding`
-- config row.
--
-- WRITE ONLY: this file is committed for the record but NOT applied by this change. Apply it via the
-- team's migration process (docs/WORKFLOW.md), never by hand. Every default here PRESERVES today's
-- behavior and ships OFF/inert (the ABSOLUTE INVARIANT, ADR-362): nothing changes and nothing charges
-- until an operator edits a value or flips a switch.
--
-- No new tables: both rows land in the existing platform_flags / pricing_settings kv stores, so there is
-- no RLS surface to add (scripts/rls-deny-all.txt is unchanged).

-- ── 1. operator-seat activation (platform_flags, boolean) ───────────────────────────────────────────
-- `catalog_operator_seat_active` (ADR-799/803): OFF (default) keeps the operator seat an inert
-- PLACEHOLDER that the catalog sync skips, so NO Stripe price is minted (lib/billing/pricing-products.ts
-- isCatalogItemInertPlaceholder). Flipping it TRUE drops the placeholder so the next sync mints the live
-- seat price from the operator-set amount. Read fail-safe FALSE via lib/pricing/settings.ts
-- loadPricingFlags(). The money flip is still billingLive(); this switch only controls whether the seat
-- item is a placeholder. Audited in platform_flag_events on every toggle (setPlatformFlag).
INSERT INTO platform_flags (key, value)
VALUES ('catalog_operator_seat_active', false)
ON CONFLICT (key) DO NOTHING;

-- ── 2. the `founding` config (pricing_settings, jsonb) ──────────────────────────────────────────────
-- The Founders Round (personal) + Founding Businesses cohort config (ADR-599/803). Seeded to the code
-- defaults (lib/pricing/founding.ts FOUNDING_DEFAULT) so the DB row mirrors the code source of truth;
-- getFoundingConfig() already fail-safes to the same defaults when the row is absent, so this seed only
-- makes the stored value explicit. Amounts in cents, the take-rate in basis points (300 = 3%), caps as
-- counts. Nothing here charges: a founding rate is a locked DISPLAY value; the money flip is the master
-- switch. ON CONFLICT DO NOTHING so a live operator-set value is never clobbered.
INSERT INTO public.pricing_settings (key, value)
VALUES (
  'founding',
  '{"member_one_time_cents": 25000, "member_cap": 150, "business_monthly_cents": 4900, "business_take_bps": 300, "business_city_cap": 25}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
