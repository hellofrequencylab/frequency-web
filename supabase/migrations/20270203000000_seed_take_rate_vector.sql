-- Seed the LIVE take-rate vector into pricing_settings (ADR-914, docs/VALUE-LADDER.md §2).
--
-- The stored `take_rate` row held only the retired ADR-552 flat trio plus `member_bps`:
--   {"free_bps": 500, "member_bps": 800, "business_bps": 300, "nonprofit_bps": 300}
--
-- It was missing `network_bps` (the per-Space-plan vector the charging path applies) and
-- `member_free_bps` (the free-Member rung, which is the reference rate the whole ladder descends from
-- and, since selling is free on every tier, the most-charged number in the product).
--
-- ⚠️ NOTHING WAS BROKEN, and that is exactly why this is worth doing. The rates resolve correctly today
-- through two layers of per-field merge — getPricingValues spreads the stored blob over
-- PRICING_DEFAULTS, and lib/billing/fees.ts resolvedNetworkRate() rebuilds a complete vector over
-- NETWORK_TAKE_RATE_DEFAULT — so an absent key silently falls back to the right number. The effect is
-- that the numbers Frequency actually charges lived in a TypeScript constant while the operator console
-- showed merged values that were not in the database. An operator could open /admin/pricing, read a
-- rate, and be looking at a code default rather than at stored config.
--
-- That is the same shape as the `beta_grace` fuse in 20270201000000: a consequential number resolving
-- from a fallback nobody could see. Same fix. The value below is IDENTICAL to PRICING_DEFAULTS.take_rate,
-- so this changes no rate for anybody; it moves the source of truth from a constant into a row.
--
-- ADDITIVE MERGE (`||`), not a replace. Right-hand keys win, everything already stored survives:
-- `member_bps` (800, already correct) and the legacy trio are preserved untouched. If an operator has
-- set something between this file being written and applied, their value for any key not named here is
-- kept. Idempotent — re-running writes the same result.

update public.pricing_settings
set value = value || jsonb_build_object(
      -- The two individual seller rungs. Free Member 10% is the reference rate; Crew 8% is what a paid
      -- personal seller buys it down to. Both are 0% on the seller's own audience, always.
      'member_free_bps', 1000,
      'member_bps', 800,
      -- Network-sourced Space rates: free 10% -> Business 5% -> Collective 3% -> Non Profit 0.
      -- Independent is 0 because it is deliberately disconnected from the network, so there is no
      -- network-sourced sale for a rate to apply to.
      'network_bps', jsonb_build_object(
        'free', 1000,
        'business', 500,
        'collective', 300,
        'nonprofit', 0,
        'independent', 0
      )
    ),
    updated_at = now()
where key = 'take_rate';

-- If the row somehow does not exist (a database restored before the pricing foundation seed), create it
-- complete rather than leaving the charging path on code defaults with nothing stored.
insert into public.pricing_settings (key, value)
select 'take_rate', jsonb_build_object(
    'free_bps', 500, 'business_bps', 300, 'nonprofit_bps', 300,
    'member_free_bps', 1000, 'member_bps', 800,
    'network_bps', jsonb_build_object(
      'free', 1000, 'business', 500, 'collective', 300, 'nonprofit', 0, 'independent', 0
    )
  )
where not exists (select 1 from public.pricing_settings where key = 'take_rate');
