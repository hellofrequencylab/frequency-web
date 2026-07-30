// PRICING DEFAULTS — the CODE-DEFAULT pricing values, and nothing else (Phase 5, ADR-916).
//
// WHY THIS IS ITS OWN MODULE. These defaults used to live in lib/pricing/settings.ts, beside the
// service-role reads. That made the one shape every price display resolves against server-only, so any
// pure module that needed it (the derived pricing grid, the marketing ladder model) had to restate the
// numbers instead of reading them. Restating them is exactly how /pricing, the home page, the funnel
// doors, and the answer-engine corpus each ended up quoting a different ladder. Splitting the values out
// costs one file and makes "read it, never retype it" possible everywhere.
//
// NOTHING HERE IS TYPED BY HAND EXCEPT THE SHAPE. Every amount is DERIVED:
//   * Space plan prices READ the code catalog the checkout bills from (lib/billing/pricing-keys.ts
//     CATALOG), including its list anchor, so a plan carries a beta rate exactly when the catalog does.
//   * The take-rates READ NETWORK_TAKE_RATE_DEFAULT, the same vector lib/billing/fees.ts falls back to.
//   * The Crew price READS PLACEHOLDER_MEMBER_PRICE_CENTS (lib/pricing/feature-tiers.ts), the one pure,
//     client-safe map the in-app ladders price their Crew rungs from. Crew is the single rung with no
//     Stripe catalog item, so that map is its source and this file is a reader.
//
// The operator's `pricing_settings` rows are layered OVER these by getPricingValues()
// (lib/pricing/settings.ts). PURE + framework-independent (no React / Supabase / Next / Stripe).

import {
  catalogItem,
  yearlyFromMonthly,
  NETWORK_TAKE_RATE_DEFAULT,
  type CatalogItemKey,
} from '@/lib/billing/pricing-keys'
import { PLACEHOLDER_MEMBER_PRICE_CENTS } from './feature-tiers'

export interface TierPrice {
  monthly_cents: number
  annual_cents: number | null
  /** Optional one-time setup fee in cents (legacy; retained for read-safe resolution of old rows). */
  setup_cents?: number
  /** Optional MONTHLY list anchor in cents (ADR-463): the crossed-out price the founding `monthly_cents`
   *  sits under (e.g. Business list $29, founding $19). Absent = no anchor (the monthly is shown plainly). */
  list_cents?: number
}

export interface PricingDefaults {
  /** The SELLABLE member ladder is exactly Member (free) and Crew (ADR-878). Free is the baseline, not
   *  a priced row, so `tier` carries Crew alone. Supporter is NOT here on purpose: it left the sellable
   *  ladder, and typing it out of the shape is what makes a $12 member price unrenderable rather than
   *  merely unrendered. The `supporter` ENTITLEMENT label still exists for read tolerance (ADR-458,
   *  lib/core/entitlement.ts maps supporter -> crew); that is a different axis from what we SELL. */
  tier: { crew: TierPrice }
  plan: {
    business: TierPrice
    collective: TierPrice
    nonprofit: TierPrice
    independent: TierPrice
  }
  /** Take-rate in basis points (500 = 5%). The LIVE rates are `network_bps` (per Space tier) plus the
   *  two individual seller rungs, `member_free_bps` (free Member, 10%) and `member_bps` (Crew, 8%) — see
   *  pricing-keys.ts sourceAware*TakeRateCents. They price NETWORK-sourced sales only: a sale to the
   *  seller's own audience is 0% by rule, and tips carry no fee at all (ADR-913). All editable at
   *  /admin/pricing. */
  take_rate: {
    // LEGACY flat fields (ADR-552's paying-state ladder). Nothing on the charging path reads them any
    // more; they stay so a stored blob written before the network vector still resolves numbers rather
    // than undefined. Edit `network_bps` / `member_bps`, never these.
    free_bps: number; business_bps: number; nonprofit_bps: number
    /** The two individual (profile) seller rungs (ADR-914). `member_free_bps` is what a FREE Member pays
     *  on a network-sourced sale and is the reference rate the whole ladder descends from;
     *  `member_bps` is the Crew rung. Both are 0% on the seller's own audience, always. */
    member_free_bps: number
    member_bps: number
    // NETWORK-sourced take-rate per space tier (ADR-811 §A). `self` orders are 0 by rule (not stored).
    // The rate drops as the tier rises; the individual seller rate rides member_bps.
    network_bps: { free: number; business: number; collective: number; nonprofit: number; independent: number }
  }
  /** Vera free-tier daily message cap. */
  vera_free_daily_cap: { messages: number }
  trial: { days: number }
  annual_discount: { months_free: number }
}

/** One plan's DEFAULT TierPrice, read straight off the code catalog item the checkout bills from
 *  (lib/billing/pricing-keys.ts CATALOG). The founding amount is the price charged today; the list
 *  amount becomes the `list_cents` anchor only when it is genuinely higher, so no plan can claim a
 *  discount the catalog does not carry. PURE. THE single conversion from catalog to settings shape. */
function planPrice(item: CatalogItemKey): TierPrice {
  const { month, year } = catalogItem(item)
  const price: TierPrice = { monthly_cents: month.foundingCents, annual_cents: year.foundingCents }
  return month.listCents > month.foundingCents ? { ...price, list_cents: month.listCents } : price
}

export const PRICING_DEFAULTS: PricingDefaults = {
  tier: {
    // Crew is ONE clean price, with NO list anchor (ADR-878). The $12 anchor is gone because the $12
    // Supporter tier it echoed is gone; the founder's member ladder is Member (free) and Crew, stated
    // plainly. An operator may still set a deliberate anchor at /admin/pricing, and priceRow honors it,
    // but no anchor ships in the code default.
    crew: {
      monthly_cents: PLACEHOLDER_MEMBER_PRICE_CENTS.crew,
      annual_cents: yearlyFromMonthly(PLACEHOLDER_MEMBER_PRICE_CENTS.crew),
    },
  },
  plan: {
    // Community Collective ladder (ADR-811). Annual = two months free (10x monthly).
    //
    // THE BETA ANCHOR IDIOM (ADR-463): `monthly_cents` is the price a Space is CHARGED today and
    // `list_cents` is the crossed-out anchor it sits under. planPrice reads both off the catalog item,
    // so a plan carries an anchor exactly when the catalog gives it one: Business and Collective ship a
    // beta rate, Non Profit and Independent ship a single price with no invented discount. A Space that
    // subscribes on a beta rate keeps it for as long as it keeps the plan (lib/pricing/beta.ts
    // grandfathering).
    business: planPrice('business_base'),
    collective: planPrice('collective_base'),
    nonprofit: planPrice('nonprofit_seat'),
    independent: planPrice('independent_base'),
  },
  take_rate: {
    // LEGACY flat trio (the retired ADR-552 paying-state ladder). Off the charging path — kept only so a
    // stored blob resolves numbers. The live rates are the vector below.
    free_bps: 500, business_bps: 300, nonprofit_bps: 300,
    // The rungs (ADR-914): a free Member pays `member_free_bps` on a network-sourced sale, a Crew seller
    // `member_bps`, and both pay 0% on their own audience. The free Member rung EQUALS the free-Space
    // rung on purpose: a free Space is held to the free-Member standard, so only paying moves the rate.
    member_free_bps: NETWORK_TAKE_RATE_DEFAULT.memberFree,
    member_bps: NETWORK_TAKE_RATE_DEFAULT.member,
    // Network-sourced Space rates: free Space 10% -> Business 5% -> Collective 3% -> Non Profit 0 ->
    // Independent 0 (left the graph). Launch low, earn the right to raise.
    network_bps: {
      free: NETWORK_TAKE_RATE_DEFAULT.free,
      business: NETWORK_TAKE_RATE_DEFAULT.business,
      collective: NETWORK_TAKE_RATE_DEFAULT.collective,
      nonprofit: NETWORK_TAKE_RATE_DEFAULT.nonprofit,
      independent: NETWORK_TAKE_RATE_DEFAULT.independent,
    },
  },
  vera_free_daily_cap: { messages: 10 },
  trial: { days: 14 }, // 14-day free trial on Space plans (card upfront; members get none, the free tier is their trial)
  annual_discount: { months_free: 2 },
}
