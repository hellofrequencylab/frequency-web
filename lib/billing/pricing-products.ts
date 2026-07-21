// STRIPE PRODUCT/PRICE SYNC (Pricing P2, ADR-363). Admin-TRIGGERED, never automatic: the
// /admin/pricing "Sync products to Stripe" action calls syncPricingProductsToStripe(), which — ONLY
// when billingEnabled() (the env keys are present) — creates/updates one Stripe Product per tier and
// the monthly+annual Prices from the admin pricing_settings VALUES, writing the resolved ids into
// pricing_stripe_prices. NEVER runs on import/boot, and never inside test/build.
//
// IDEMPOTENT: Products are looked up/created by a stable metadata key (frequency_pricing_key) so a
// re-sync reuses the same Product rather than duplicating it. Stripe Prices are immutable, so a price
// AMOUNT change creates a NEW Price (and archives the old one) — the standard Stripe pattern; the new
// id is written back to the map. Founder prices are created as SEPARATE Price objects on the same
// Product, recorded archived=true (not offered publicly, referenced by profiles.locked_price_id).
//
// Server-only. FAIL-SAFE with clear errors when env is missing (returns { ok:false, reason:'env' }).
// This module makes LIVE Stripe calls, so it is ONLY ever invoked from the gated admin action, never
// at module load — keeping `pnpm test`/`pnpm build` free of any Stripe traffic.

import { stripe, billingEnabled } from './stripe'
import { getPricingValues, type TierPrice } from '@/lib/pricing/settings'
import { loadStripePriceMap, upsertStripePrice } from './pricing-prices'
import {
  MEMBER_TIER_KEYS,
  SPACE_PLAN_KEYS,
  PERIODS_BY_KEY,
  priceKey,
  type BillingPeriod,
  type MemberTierKey,
  type SpacePlanKey,
  BILLING_INTERVALS,
  catalogItems,
  catalogAmounts,
  catalogPriceKey,
  RETIRED_CATALOG_KEYS,
  type BillingInterval,
  type CatalogItem,
} from './pricing-keys'

// The metadata key on every managed Product, so a re-sync finds it instead of creating a duplicate.
const PRODUCT_META_KEY = 'frequency_pricing_key'

/** Human label for a Product (operator/SEO copy — plain voice, no em dashes). */
const PRODUCT_LABEL: Record<MemberTierKey | SpacePlanKey, string> = {
  crew: 'Frequency Crew',
  supporter: 'Frequency Supporter',
  business: 'Frequency Business (Space)',
  nonprofit: 'Frequency Non Profit (Space)',
}

export interface SyncResult {
  ok: boolean
  /** Why the sync was skipped (when ok=false). */
  reason?: 'env'
  /** A per-key summary for the admin surface. */
  synced: { key: string; productId: string; priceId: string; founder: boolean }[]
  errors: { key: string; message: string }[]
}

/** The amount (cents) for a base+period from the admin pricing values. null = no price for that
 *  period (monthly-only plans). PURE-ish read of the already-loaded values. */
function amountFor(price: TierPrice, period: BillingPeriod): number | null {
  if (period === 'monthly') return price.monthly_cents ?? null
  return price.annual_cents ?? null
}

/** Find the managed Product for a key by its metadata, else create it. Idempotent. */
async function ensureProduct(
  base: MemberTierKey | SpacePlanKey,
): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.')
  // Look up by metadata via search (Stripe supports product metadata search). A miss → create.
  const found = await stripe.products.search({
    query: `metadata['${PRODUCT_META_KEY}']:'${base}'`,
    limit: 1,
  })
  const existing = found.data[0]
  if (existing) {
    // Keep the display name in sync (cheap; safe to call every sync).
    if (existing.name !== PRODUCT_LABEL[base]) {
      await stripe.products.update(existing.id, { name: PRODUCT_LABEL[base] })
    }
    return existing.id
  }
  const created = await stripe.products.create({
    name: PRODUCT_LABEL[base],
    metadata: { [PRODUCT_META_KEY]: base },
  })
  return created.id
}

/** Find an active recurring Price on a Product matching amount + interval, else create one. Stripe
 *  Prices are immutable, so a changed amount yields a NEW Price (the old stays, optionally archived by
 *  the caller). Returns the resolved price id. `founder` only tags the Price metadata. */
async function ensurePrice(opts: {
  productId: string
  base: MemberTierKey | SpacePlanKey
  period: BillingPeriod
  amountCents: number
  founder: boolean
}): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.')
  const interval: 'month' | 'year' = opts.period === 'monthly' ? 'month' : 'year'
  const key = priceKey(opts.base, opts.period, opts.founder)

  // Reuse an existing active Price with the same amount + interval + key (idempotent re-sync).
  const prices = await stripe.prices.list({ product: opts.productId, active: true, limit: 100 })
  const match = prices.data.find(
    (p) =>
      p.unit_amount === opts.amountCents &&
      p.recurring?.interval === interval &&
      p.currency === 'usd' &&
      p.metadata?.[PRODUCT_META_KEY] === key,
  )
  if (match) return match.id

  const created = await stripe.prices.create({
    product: opts.productId,
    currency: 'usd',
    unit_amount: opts.amountCents,
    recurring: { interval },
    // Founder prices are not shown in the customer-facing pricing table; tag + (caller) archives them.
    metadata: { [PRODUCT_META_KEY]: key, founder: opts.founder ? 'true' : 'false' },
  })
  return created.id
}

/** Create/update the Stripe Products + Prices from the admin pricing values and write the resolved
 *  ids into pricing_stripe_prices. ONLY runs when billingEnabled() (env keys present); otherwise a
 *  clear no-op. Idempotent. Invoked exclusively from the env-gated /admin/pricing sync action.
 *
 *  Founder variants are created for the member tiers (the founding-member program is personal) and
 *  stored archived=true so they are referenced by profiles.locked_price_id but never offered publicly.
 *
 *  `changedBy` is the operator's profile id (audited on the map rows). */
export async function syncPricingProductsToStripe(changedBy?: string | null): Promise<SyncResult> {
  if (!billingEnabled() || !stripe) {
    return { ok: false, reason: 'env', synced: [], errors: [] }
  }

  const values = await getPricingValues()
  const result: SyncResult = { ok: true, synced: [], errors: [] }

  // Walk every base (member tiers + space plans). For each, sync each offered period's public price,
  // and additionally a founder variant for the member tiers.
  const bases: { base: MemberTierKey | SpacePlanKey; price: TierPrice; founderEligible: boolean }[] = [
    ...MEMBER_TIER_KEYS.map((b) => ({ base: b, price: values.tier[b], founderEligible: true })),
    ...SPACE_PLAN_KEYS.map((b) => ({ base: b, price: values.plan[b], founderEligible: false })),
  ]

  for (const { base, price, founderEligible } of bases) {
    let productId: string
    try {
      productId = await ensureProduct(base)
    } catch (e) {
      result.errors.push({ key: base, message: e instanceof Error ? e.message : 'Could not sync the product.' })
      result.ok = false
      continue
    }

    for (const period of PERIODS_BY_KEY[base]) {
      const amount = amountFor(price, period)
      if (amount == null || amount <= 0) continue // monthly-only plans skip annual; a $0 price is not created

      // Public price.
      const variants: { founder: boolean }[] = founderEligible ? [{ founder: false }, { founder: true }] : [{ founder: false }]
      for (const { founder } of variants) {
        const key = priceKey(base, period, founder)
        try {
          const priceId = await ensurePrice({ productId, base, period, amountCents: amount, founder })
          await upsertStripePrice({
            key,
            stripe_product_id: productId,
            stripe_price_id: priceId,
            archived: founder, // founder prices are archived-from-public
            changedBy,
          })
          result.synced.push({ key, productId, priceId, founder })
        } catch (e) {
          result.errors.push({ key, message: e instanceof Error ? e.message : 'Could not sync the price.' })
          result.ok = false
        }
      }
    }
  }

  return result
}

// ── PHASE B: the CLEAN catalog sync (ADR-460, docs/PRICING-LADDER-PLAN.md §4/§5) ──────────────────
// syncPricingCatalogToStripe walks the typed catalog (lib/billing/pricing-keys.ts CATALOG): the Pro
// base, the four add-ons, the nonprofit licensed seat, and the organization plan. For EACH item it
// ensures one Stripe Product (looked up by the same frequency_pricing_key metadata, idempotent) and
// FOUR Prices: { founding, list } x { month, year }. The FOUNDING prices are active (the one charged);
// the LIST prices are the visible anchors, synced archived (not sold, read only for the anchor amount).
// Retired legacy keys (practitioner/business/whitelabel/supporter variants) are ARCHIVED in the price
// map, never deleted, so a grandfathered locked price id still resolves.
//
// Same gates as syncPricingProductsToStripe: a clean no-op (ok:false, reason:'env') when Stripe is not
// configured, never a live call on import/boot/test. Idempotent: re-running reuses Products + matching
// Prices and only creates a new Price when an amount changed (Stripe Prices are immutable).

/** Find/create the managed Product for a catalog item by its metadata key (idempotent). */
async function ensureCatalogProduct(item: CatalogItem): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.')
  const found = await stripe.products.search({
    query: `metadata['${PRODUCT_META_KEY}']:'${item.key}'`,
    limit: 1,
  })
  const existing = found.data[0]
  if (existing) {
    if (existing.name !== item.label) {
      await stripe.products.update(existing.id, { name: item.label })
    }
    return existing.id
  }
  const created = await stripe.products.create({
    name: item.label,
    metadata: { [PRODUCT_META_KEY]: item.key, perSeat: item.perSeat ? 'true' : 'false' },
  })
  return created.id
}

/** Find an active recurring Price on a Product matching amount + interval + the catalog price key, else
 *  create one (Stripe Prices are immutable, so a changed amount yields a new Price). `list` tags it as
 *  the anchor variant. Returns the resolved price id. */
async function ensureCatalogPrice(opts: {
  productId: string
  priceKey: string
  interval: BillingInterval
  amountCents: number
  list: boolean
}): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.')
  const prices = await stripe.prices.list({ product: opts.productId, active: true, limit: 100 })
  const match = prices.data.find(
    (p) =>
      p.unit_amount === opts.amountCents &&
      p.recurring?.interval === opts.interval &&
      p.currency === 'usd' &&
      p.metadata?.[PRODUCT_META_KEY] === opts.priceKey,
  )
  if (match) return match.id
  const created = await stripe.prices.create({
    product: opts.productId,
    currency: 'usd',
    unit_amount: opts.amountCents,
    recurring: { interval: opts.interval },
    // list = the anchor (not sold, archived in the map); founding = the charged price.
    metadata: { [PRODUCT_META_KEY]: opts.priceKey, variant: opts.list ? 'list' : 'founding' },
  })
  return created.id
}

/** Sync the CLEAN Phase B catalog (Pro base + add-ons + nonprofit seat + organization) to Stripe and
 *  write the resolved ids into pricing_stripe_prices. For each item: a Product + the four
 *  {founding,list} x {month,year} Prices (founding active, list archived-anchor). Then ARCHIVE every
 *  retired legacy key still in the map (never delete). ONLY runs when billingEnabled() (env keys
 *  present); otherwise a clean no-op. Idempotent. Invoked exclusively from the env-gated /admin/pricing
 *  sync action. `changedBy` is the operator's profile id (audited on the map rows). */
export async function syncPricingCatalogToStripe(changedBy?: string | null): Promise<SyncResult> {
  if (!billingEnabled() || !stripe) {
    return { ok: false, reason: 'env', synced: [], errors: [] }
  }

  const result: SyncResult = { ok: true, synced: [], errors: [] }

  for (const item of catalogItems()) {
    // A PLACEHOLDER item (operator_seat, ADR-799) carries a stand-in amount the owner has not approved.
    // Skip it entirely so the sync mints NO Stripe product/price for it — resolveLoadoutPriceId stays null
    // and the item is inert until the owner sets the real amount and drops the flag. Without this, a routine
    // sync of the live catalog would silently create a chargeable seat price the owner never set.
    if (item.placeholder) continue
    let productId: string
    try {
      productId = await ensureCatalogProduct(item)
    } catch (e) {
      result.errors.push({ key: item.key, message: e instanceof Error ? e.message : 'Could not sync the product.' })
      result.ok = false
      continue
    }

    for (const interval of BILLING_INTERVALS) {
      const amounts = catalogAmounts(item.key, interval)
      // Two variants per interval: founding (the charged price, active) and list (the anchor, archived).
      const variants: { list: boolean; amountCents: number }[] = [
        { list: false, amountCents: amounts.foundingCents },
        { list: true, amountCents: amounts.listCents },
      ]
      for (const { list, amountCents } of variants) {
        if (amountCents == null || amountCents <= 0) continue
        const key = catalogPriceKey(item.key, interval, list)
        try {
          const priceId = await ensureCatalogPrice({ productId, priceKey: key, interval, amountCents, list })
          await upsertStripePrice({
            key,
            stripe_product_id: productId,
            stripe_price_id: priceId,
            // The list anchor is recorded archived (read-only for display); the founding price is active.
            archived: list,
            changedBy,
          })
          result.synced.push({ key, productId, priceId, founder: !list })
        } catch (e) {
          result.errors.push({ key, message: e instanceof Error ? e.message : 'Could not sync the price.' })
          result.ok = false
        }
      }
    }
  }

  // Archive (never delete) every retired legacy key still present in the map, so a grandfathered locked
  // price id keeps resolving while the key drops out of the sold catalog.
  try {
    const map = await loadStripePriceMap()
    for (const key of RETIRED_CATALOG_KEYS) {
      const row = map[key]
      if (row && !row.archived) {
        await upsertStripePrice({
          key,
          stripe_product_id: row.stripe_product_id,
          stripe_price_id: row.stripe_price_id,
          archived: true,
          changedBy,
        })
      }
    }
  } catch (e) {
    result.errors.push({ key: 'retired', message: e instanceof Error ? e.message : 'Could not archive retired keys.' })
    result.ok = false
  }

  return result
}
