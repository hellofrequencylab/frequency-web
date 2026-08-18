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
import { getPricingValues, loadPricingFlags, type TierPrice } from '@/lib/pricing/settings'
import { loadCatalogConfig, catalogConfigByKey } from '@/lib/pricing/catalog-config'
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
  catalogPriceKey,
  RETIRED_CATALOG_KEYS,
  type BillingInterval,
  type CatalogAmounts,
  type CatalogItem,
  type CatalogItemKey,
} from './pricing-keys'

// The metadata key on every managed Product, so a re-sync finds it instead of creating a duplicate.
const PRODUCT_META_KEY = 'frequency_pricing_key'

/** Human label for a Product (operator/SEO copy — plain voice, no em dashes). */
const PRODUCT_LABEL: Record<MemberTierKey | SpacePlanKey, string> = {
  crew: 'Frequency Crew',
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
// syncPricingCatalogToStripe walks the typed catalog (lib/billing/pricing-keys.ts CATALOG): the paid
// bases, the AI add-on, the nonprofit plan and the operator seat. For EACH item it ensures the Stripe
// Product(s) it needs (looked up by the same frequency_pricing_key metadata, idempotent) and FOUR
// Prices: { founding, list } x { month, year }.
//
// 🔴 THE SPLIT (ADR-1062): the STANDARD product carries ONLY the regular (list) prices, and the
// founding/beta rates hang on a SEPARATE product. Owner, 2026-08-17: "standard pricing does not have a
// founding or beta rate ... Regular pricing + a founding beta product." One product carrying both $79
// and $49 reads, to anyone opening the Stripe dashboard, as if the beta rate were part of the standard
// offering. It is not: since ADR-1060 closed the window, the founding rate is reachable ONLY through a
// grandfathered lock or the private per-Space grant (ADR-1061).
//
// Retired legacy keys (practitioner/business/whitelabel/supporter variants) are ARCHIVED in the price
// map, never deleted, so a grandfathered locked price id still resolves.
//
// Same gates as syncPricingProductsToStripe: a clean no-op (ok:false, reason:'env') when Stripe is not
// configured, never a live call on import/boot/test. Idempotent: re-running reuses Products + matching
// Prices and only creates a new Price when an amount changed (Stripe Prices are immutable).

/** Whether a catalog item is an INERT placeholder for the sync (so it mints no Stripe product/price).
 *  An item is inert when its code `placeholder` flag is set AND the operator has not activated it. Only
 *  the operator seat (ADR-799/803) has an activation switch (`catalog_operator_seat_active`); every other
 *  placeholder stays inert regardless. PURE — the sync reads the flag and passes it here. Keeping the
 *  placeholder-skip is the ABSOLUTE INVARIANT (ADR-362): a routine sync never mints a seat price the
 *  owner has not explicitly turned on. */
export function isCatalogItemInertPlaceholder(item: CatalogItem, operatorSeatActive: boolean): boolean {
  if (!item.placeholder) return false
  if (item.key === 'operator_seat') return !operatorSeatActive
  return true
}

/** Which PRODUCT a catalog item's price hangs on (ADR-1062).
 *  - `standard`  — the regular offering. Carries ONLY the list prices, the amounts on public sale.
 *  - `founding`  — the founding/beta rates. Not part of the standard offering: since ADR-1060 shut the
 *                  window they are reached only by a grandfathered lock or the per-Space grant (ADR-1061).
 *  PURE. */
export type CatalogProductLine = 'standard' | 'founding'

/** Extra product metadata: which catalog item this Product belongs to, so a human (or a future query)
 *  can pair the standard and founding Products of one item without parsing names. */
const PRODUCT_ITEM_META_KEY = 'frequency_catalog_item'
/** Extra product metadata: which product line this is ('standard' | 'founding'). */
const PRODUCT_LINE_META_KEY = 'frequency_product_line'

/** The STABLE `frequency_pricing_key` metadata value a catalog Product is looked up by — the identity a
 *  re-sync reuses instead of minting a duplicate. The standard product keeps the bare item key
 *  (UNCHANGED by the split, so the first sync and every later one find the same object); the founding
 *  product takes `<item>_founding`, which cannot collide with any price key (those are
 *  `<item>_<interval>` / `<item>_<interval>_list`) nor with another item's key. PURE. */
export function catalogProductMetaKey(item: CatalogItemKey, line: CatalogProductLine): string {
  return line === 'founding' ? `${item}_founding` : item
}

/** The Product name a human reads in the Stripe dashboard. The founding product is the item's name plus
 *  a parenthetical, matching the catalog's own convention ("Frequency Vera AI (add-on)"). No em dash
 *  (docs/CONTENT-VOICE.md); plain words, so the dashboard says what the object is. PURE. */
export function catalogProductLabel(item: CatalogItem, line: CatalogProductLine): string {
  return line === 'founding' ? `${item.label} (Founding rate)` : item.label
}

/** Does this item carry a REAL founding rate — an amount strictly BELOW list on either interval?
 *
 *  Only such an item gets a founding Product. Independent, Non Profit, Vera AI and the operator seat
 *  ship `foundingCents == listCents`: there is no beta rate to separate, so minting a
 *  "(Founding rate)" product for them would INVENT the very thing the owner asked us to remove. Their
 *  founding-variant KEY still exists and still resolves — it just points at the standard product, at
 *  the standard amount. PURE (reads the operator-resolved amounts the sync is about to mint). */
export function catalogItemHasFoundingRate(amounts: { month: CatalogAmounts; year: CatalogAmounts }): boolean {
  const below = (a: CatalogAmounts) => a.foundingCents > 0 && a.foundingCents < a.listCents
  return below(amounts.month) || below(amounts.year)
}

/** Find/create the managed Product for a catalog item's product LINE by its metadata key (idempotent). */
async function ensureCatalogProduct(item: CatalogItem, line: CatalogProductLine): Promise<string> {
  if (!stripe) throw new Error('Stripe is not configured.')
  const metaKey = catalogProductMetaKey(item.key, line)
  const name = catalogProductLabel(item, line)
  const found = await stripe.products.search({
    query: `metadata['${PRODUCT_META_KEY}']:'${metaKey}'`,
    limit: 1,
  })
  const existing = found.data[0]
  if (existing) {
    if (existing.name !== name) {
      await stripe.products.update(existing.id, { name })
    }
    return existing.id
  }
  const created = await stripe.products.create({
    name,
    metadata: {
      [PRODUCT_META_KEY]: metaKey,
      [PRODUCT_ITEM_META_KEY]: item.key,
      [PRODUCT_LINE_META_KEY]: line,
      perSeat: item.perSeat ? 'true' : 'false',
    },
  })
  return created.id
}

/** Find an active recurring Price on a Product matching amount + interval + the catalog price key, else
 *  create one (Stripe Prices are immutable, so a changed amount yields a new Price). `list` tags it as
 *  the standard variant. Returns the resolved price id. Every Price is created ACTIVE and this function
 *  never deactivates one: the founding price must stay usable in a new subscription (ADR-1061). */
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
    // The price metadata is UNCHANGED by the product split: `frequency_pricing_key` is the row key the
    // map resolves and the webhook reads back off a subscription item (space-subscription-items.ts,
    // founding-payment.ts), so it must keep saying exactly what it said before.
    metadata: { [PRODUCT_META_KEY]: opts.priceKey, variant: opts.list ? 'list' : 'founding' },
  })
  return created.id
}

/** Sync the CLEAN Phase B catalog to Stripe and write the resolved ids into pricing_stripe_prices.
 *  For each item: the STANDARD Product carrying the list prices, plus — only when the item actually
 *  carries a rate below list — a SEPARATE founding Product carrying the founding rates (ADR-1062). Then
 *  ARCHIVE every retired legacy key still in the map (never delete). ONLY runs when billingEnabled()
 *  (env keys present); otherwise a clean no-op. Idempotent. Invoked exclusively from the env-gated
 *  /admin/pricing sync action. `changedBy` is the operator's profile id (audited on the map rows).
 *
 *  🔴 NOTHING HERE ARCHIVES A STRIPE PRICE. Every Price is created active and stays active; `archived`
 *  on the map row is a pricing_stripe_prices annotation, never Stripe's `active`. That is load-bearing:
 *  the founding price ids must remain usable in a NEW subscription so the per-Space beta grant
 *  (ADR-1061) and a future lock can charge them. A price archived in Stripe cannot be. */
export async function syncPricingCatalogToStripe(changedBy?: string | null): Promise<SyncResult> {
  if (!billingEnabled() || !stripe) {
    return { ok: false, reason: 'env', synced: [], errors: [] }
  }

  const result: SyncResult = { ok: true, synced: [], errors: [] }

  // The operator-editable amounts (over the code defaults, ADR-463) and the operator-seat activation
  // switch (ADR-803). Both fail-safe: a missing override reads the code amount, a missing flag reads OFF.
  const [catalog, flags] = await Promise.all([loadCatalogConfig(), loadPricingFlags()])
  const resolvedByKey = catalogConfigByKey(catalog)
  const operatorSeatActive = flags.catalog_operator_seat_active

  for (const item of catalogItems()) {
    // A PLACEHOLDER item (operator_seat, ADR-799) carries a stand-in amount the owner has not approved.
    // Skip it entirely so the sync mints NO Stripe product/price for it — resolveLoadoutPriceId stays null
    // and the item is inert until the owner sets the real amount and activates it. Without this, a routine
    // sync of the live catalog would silently create a chargeable seat price the owner never set. The seat
    // stays inert until `catalog_operator_seat_active` is flipped on (ADR-803).
    if (isCatalogItemInertPlaceholder(item, operatorSeatActive)) continue

    // Sync the OPERATOR-SET amounts (the console's "run this after you change a catalog price" contract),
    // fail-safe to the code catalog when no override exists (ADR-463/803). Read BEFORE the products are
    // ensured, because the amounts are what decide whether this item needs a founding Product at all.
    const resolved = resolvedByKey[item.key]

    let standardProductId: string
    try {
      standardProductId = await ensureCatalogProduct(item, 'standard')
    } catch (e) {
      result.errors.push({ key: item.key, message: e instanceof Error ? e.message : 'Could not sync the product.' })
      result.ok = false
      continue
    }

    // The founding Product exists ONLY for an item that really is discounted below list today. A
    // failure to mint it does not block the standard offering: the list prices still sync and the
    // founding keys report an error, rather than silently landing back on the standard product.
    const splitFounding = catalogItemHasFoundingRate(resolved)
    let foundingProductId: string | null = null
    if (splitFounding) {
      try {
        foundingProductId = await ensureCatalogProduct(item, 'founding')
      } catch (e) {
        result.errors.push({
          key: catalogProductMetaKey(item.key, 'founding'),
          message: e instanceof Error ? e.message : 'Could not sync the founding product.',
        })
        result.ok = false
      }
    }

    for (const interval of BILLING_INTERVALS) {
      const amounts = interval === 'month' ? resolved.month : resolved.year
      // Two variants per interval: list (the standard, publicly sold price) and founding (the beta rate,
      // reachable only through a lock or the per-Space grant since ADR-1060 closed the window).
      const variants: { list: boolean; amountCents: number }[] = [
        { list: false, amountCents: amounts.foundingCents },
        { list: true, amountCents: amounts.listCents },
      ]
      for (const { list, amountCents } of variants) {
        if (amountCents == null || amountCents <= 0) continue
        const key = catalogPriceKey(item.key, interval, list)
        // WHICH PRODUCT (ADR-1062). List always on the standard product. A founding rate goes on the
        // founding product when the item has one; when founding == list there IS no founding rate, so
        // that key stays on the standard product rather than inventing a beta product for a flat plan.
        const productId = list || !splitFounding ? standardProductId : foundingProductId
        if (!productId) {
          result.errors.push({ key, message: 'Could not sync the founding product for this item.' })
          result.ok = false
          continue
        }
        try {
          const priceId = await ensureCatalogPrice({ productId, priceKey: key, interval, amountCents, list })
          await upsertStripePrice({
            key,
            stripe_product_id: productId,
            stripe_price_id: priceId,
            // UNCHANGED map annotation, and it is NOT Stripe's `active`: both prices are live objects in
            // Stripe. `archived` here has always meant "not the plain, publicly quoted row" (it was
            // written when the founding rate was the charged one). Post-ADR-1060 the list row is what
            // checkout charges, so this flag no longer tracks what is sold — nothing reads it to decide
            // (resolveStripePriceId ignores it), so it is left exactly as it was rather than flipped
            // under the split. See ADR-1062 §Consequences.
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
