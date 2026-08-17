import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE CATALOG SYNC, against a FAKE Stripe (ADR-1062). No network, ever: `./stripe` is mocked, so this
// exercises the real syncPricingCatalogToStripe wiring with an in-memory Stripe that records every call.
//
// WHAT IT PINS.
//  1. THE SPLIT. The standard Product carries ONLY the regular (list) prices; the founding/beta rates
//     hang on their own Product. Owner, 2026-08-17: "standard pricing does not have a founding or beta
//     rate ... Regular pricing + a founding beta product."
//  2. THE KEY SET IS UNTOUCHED. Moving prices between Products must not move a single pricing_stripe_
//     prices KEY — `resolveLoadoutPriceId`, the per-Space beta grant (ADR-1061) and a grandfathered lock
//     all resolve a KEY. The frozen literal below is the regression that would otherwise be silent.
//  3. THE FOUNDING PRICES STAY ACTIVE IN STRIPE. A price archived in Stripe cannot be used in a NEW
//     subscription, which is exactly what the grant needs it for.
//  4. IDEMPOTENCY. A second sync creates no second Product and no second Price.

type FakeProduct = { id: string; name: string; metadata: Record<string, string> }
type FakePrice = {
  id: string
  product: string
  unit_amount: number
  currency: string
  active: boolean
  recurring: { interval: string }
  metadata: Record<string, string>
}

const { store, calls } = vi.hoisted(() => ({
  store: { products: [] as FakeProduct[], prices: [] as FakePrice[], n: 0 },
  calls: {
    productCreate: [] as FakeProduct[],
    productUpdate: [] as { id: string; args: Record<string, unknown> }[],
    priceCreate: [] as Record<string, unknown>[],
    priceUpdate: [] as { id: string; args: Record<string, unknown> }[],
  },
}))

/** The metadata value a `metadata['frequency_pricing_key']:'x'` search query is asking for. */
function searchedKey(query: string): string {
  return /:'([^']*)'/.exec(query)?.[1] ?? ''
}

vi.mock('./stripe', () => ({
  billingEnabled: () => true,
  stripe: {
    products: {
      search: ({ query }: { query: string }) => {
        const want = searchedKey(query)
        return Promise.resolve({ data: store.products.filter((p) => p.metadata.frequency_pricing_key === want).slice(0, 1) })
      },
      create: (args: { name: string; metadata: Record<string, string> }) => {
        const created: FakeProduct = { id: `prod_${++store.n}`, name: args.name, metadata: args.metadata }
        store.products.push(created)
        calls.productCreate.push(created)
        return Promise.resolve(created)
      },
      update: (id: string, args: Record<string, unknown>) => {
        calls.productUpdate.push({ id, args })
        const p = store.products.find((x) => x.id === id)
        if (p && typeof args.name === 'string') p.name = args.name
        return Promise.resolve(p)
      },
    },
    prices: {
      list: ({ product, active }: { product: string; active?: boolean }) =>
        Promise.resolve({ data: store.prices.filter((p) => p.product === product && (active ? p.active : true)) }),
      create: (args: {
        product: string
        currency: string
        unit_amount: number
        recurring: { interval: string }
        metadata: Record<string, string>
      }) => {
        // Stripe creates a Price ACTIVE unless told otherwise; the fake mirrors that so an `active:false`
        // the sync might one day pass would show up in the assertions below.
        const created: FakePrice = {
          id: `price_${++store.n}`,
          product: args.product,
          unit_amount: args.unit_amount,
          currency: args.currency,
          active: (args as { active?: boolean }).active !== false,
          recurring: args.recurring,
          metadata: args.metadata,
        }
        store.prices.push(created)
        calls.priceCreate.push(args as unknown as Record<string, unknown>)
        return Promise.resolve(created)
      },
      update: (id: string, args: Record<string, unknown>) => {
        calls.priceUpdate.push({ id, args })
        return Promise.resolve({ id })
      },
    },
  },
}))

/** The written map rows, in write order. `loadStripePriceMap` is empty, so the retired-key pass no-ops. */
const written = vi.hoisted(() => [] as { key: string; productId: string | null; priceId: string | null; archived: boolean }[])

vi.mock('./pricing-prices', () => ({
  loadStripePriceMap: () => Promise.resolve({}),
  upsertStripePrice: (row: { key: string; stripe_product_id: string | null; stripe_price_id: string | null; archived?: boolean }) => {
    written.push({
      key: row.key,
      productId: row.stripe_product_id,
      priceId: row.stripe_price_id,
      archived: row.archived === true,
    })
    return Promise.resolve()
  },
}))

vi.mock('@/lib/pricing/settings', () => ({
  getPricingValues: () => Promise.resolve({ tier: {}, plan: {} }),
  loadPricingFlags: () => Promise.resolve({ catalog_operator_seat_active: false }),
}))

// The code-default catalog amounts, resolved by the REAL pure shaping — no database.
vi.mock('@/lib/pricing/catalog-config', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/pricing/catalog-config')>()
  return { ...orig, loadCatalogConfig: () => Promise.resolve(orig.defaultCatalogConfig()) }
})

import { syncPricingCatalogToStripe, catalogProductMetaKey, catalogProductLabel, catalogItemHasFoundingRate } from './pricing-products'
import { catalogItem, catalogPriceKey } from './pricing-keys'

/** THE FROZEN KEY SET. Every key the catalog sync writes, byte for byte, sorted. The operator seat is a
 *  placeholder with its activation switch OFF, so it mints nothing (the ADR-362 invariant). If the
 *  product split ever moved a key, this list is what fails. */
const FROZEN_SYNCED_KEYS = [
  'addon_ai_month',
  'addon_ai_month_list',
  'addon_ai_year',
  'addon_ai_year_list',
  'business_base_month',
  'business_base_month_list',
  'business_base_year',
  'business_base_year_list',
  'collective_base_month',
  'collective_base_month_list',
  'collective_base_year',
  'collective_base_year_list',
  'independent_base_month',
  'independent_base_month_list',
  'independent_base_year',
  'independent_base_year_list',
  'nonprofit_seat_month',
  'nonprofit_seat_month_list',
  'nonprofit_seat_year',
  'nonprofit_seat_year_list',
]

const rowFor = (key: string) => written.find((r) => r.key === key)
const productById = (id: string | null | undefined) => store.products.find((p) => p.id === id)
const priceById = (id: string | null | undefined) => store.prices.find((p) => p.id === id)

beforeEach(() => {
  store.products.length = 0
  store.prices.length = 0
  store.n = 0
  written.length = 0
  calls.productCreate.length = 0
  calls.productUpdate.length = 0
  calls.priceCreate.length = 0
  calls.priceUpdate.length = 0
})

describe('the price KEY set is unchanged by the product split (ADR-1062)', () => {
  it('writes exactly the frozen key set, and every key is what catalogPriceKey produces', async () => {
    const res = await syncPricingCatalogToStripe('op-1')
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect([...new Set(written.map((r) => r.key))].sort()).toEqual(FROZEN_SYNCED_KEYS)
    // Not a hand-typed list that happens to match: each frozen key is the pure key function's output.
    expect(catalogPriceKey('collective_base', 'year')).toBe('collective_base_year')
    expect(catalogPriceKey('collective_base', 'year', true)).toBe('collective_base_year_list')
    expect(FROZEN_SYNCED_KEYS).toContain(catalogPriceKey('collective_base', 'year'))
    expect(FROZEN_SYNCED_KEYS).toContain(catalogPriceKey('business_base', 'month'))
  })

  it('the operator seat mints nothing while its activation switch is OFF (ADR-362/803)', async () => {
    await syncPricingCatalogToStripe('op-1')
    expect(written.some((r) => r.key.startsWith('operator_seat'))).toBe(false)
    expect(store.products.some((p) => p.metadata.frequency_catalog_item === 'operator_seat')).toBe(false)
  })

  it('the PRICE metadata still carries the row key, which the webhook reads back off a subscription item', async () => {
    await syncPricingCatalogToStripe('op-1')
    const founding = priceById(rowFor('collective_base_month')?.priceId)
    const list = priceById(rowFor('collective_base_month_list')?.priceId)
    expect(founding?.metadata.frequency_pricing_key).toBe('collective_base_month')
    expect(list?.metadata.frequency_pricing_key).toBe('collective_base_month_list')
  })
})

describe('standard pricing carries no founding rate (the owner decision, ADR-1062)', () => {
  it('Collective: the $49 founding rates sit on their OWN product, and the standard product holds only $79', async () => {
    await syncPricingCatalogToStripe('op-1')
    const standard = productById(rowFor('collective_base_month_list')?.productId)
    const founding = productById(rowFor('collective_base_month')?.productId)
    expect(standard?.name).toBe('Frequency Collective')
    expect(founding?.name).toBe('Frequency Collective (Founding rate)')
    expect(founding?.id).not.toBe(standard?.id)

    // The standard product's prices are the list amounts, and ONLY the list amounts.
    const onStandard = store.prices.filter((p) => p.product === standard?.id)
    expect(onStandard.map((p) => p.unit_amount).sort((a, b) => a - b)).toEqual([7900, 79000])
    expect(onStandard.every((p) => p.metadata.variant === 'list')).toBe(true)
    // The founding product's prices are the beta amounts, and only those.
    const onFounding = store.prices.filter((p) => p.product === founding?.id)
    expect(onFounding.map((p) => p.unit_amount).sort((a, b) => a - b)).toEqual([4900, 49000])
    expect(onFounding.every((p) => p.metadata.variant === 'founding')).toBe(true)
  })

  it('Business: same split, $19 off the $29 product', async () => {
    await syncPricingCatalogToStripe('op-1')
    const standardId = rowFor('business_base_month_list')?.productId
    const foundingId = rowFor('business_base_month')?.productId
    expect(foundingId).not.toBe(standardId)
    expect(productById(foundingId)?.name).toBe('Frequency Business (Founding rate)')
    expect(priceById(rowFor('business_base_month')?.priceId)?.unit_amount).toBe(1900)
    expect(priceById(rowFor('business_base_month_list')?.priceId)?.unit_amount).toBe(2900)
  })

  it('a FLAT item gets no founding product at all, because it has no founding rate to separate', async () => {
    await syncPricingCatalogToStripe('op-1')
    // Independent / Non Profit / Vera AI ship founding == list. Minting a "(Founding rate)" product for
    // them would invent the very thing the owner asked us to remove.
    for (const key of ['independent_base', 'nonprofit_seat', 'addon_ai'] as const) {
      expect(catalogItemHasFoundingRate(catalogItem(key))).toBe(false)
      expect(store.products.some((p) => p.metadata.frequency_pricing_key === `${key}_founding`)).toBe(false)
      // Both keys still resolve, both to the one standard product.
      expect(rowFor(`${key}_month`)?.productId).toBe(rowFor(`${key}_month_list`)?.productId)
      expect(rowFor(`${key}_month`)?.priceId).toBeTruthy()
    }
    expect(store.products.filter((p) => p.metadata.frequency_product_line === 'founding')).toHaveLength(2)
  })

  it('the founding product is looked up by its OWN stable metadata key', async () => {
    await syncPricingCatalogToStripe('op-1')
    expect(catalogProductMetaKey('collective_base', 'standard')).toBe('collective_base')
    expect(catalogProductMetaKey('collective_base', 'founding')).toBe('collective_base_founding')
    expect(catalogProductLabel(catalogItem('collective_base'), 'founding')).toBe('Frequency Collective (Founding rate)')
    const founding = store.products.find((p) => p.metadata.frequency_pricing_key === 'collective_base_founding')
    expect(founding?.metadata.frequency_catalog_item).toBe('collective_base')
    expect(founding?.metadata.frequency_product_line).toBe('founding')
    // The standard product's lookup key is UNCHANGED by the split, so a re-sync finds the same object.
    expect(store.products.some((p) => p.metadata.frequency_pricing_key === 'collective_base')).toBe(true)
  })
})

describe('the founding prices stay chargeable (ADR-1061 needs them ACTIVE in Stripe)', () => {
  it('every price is created active, and the sync never deactivates one', async () => {
    await syncPricingCatalogToStripe('op-1')
    expect(store.prices.every((p) => p.active)).toBe(true)
    expect(calls.priceCreate.every((args) => args.active === undefined)).toBe(true)
    // The one call that could archive a Stripe price is prices.update({ active: false }). It is never made.
    expect(calls.priceUpdate).toEqual([])
  })

  it('the `archived` map flag is a row annotation only, and is unchanged by the split', async () => {
    await syncPricingCatalogToStripe('op-1')
    // Same values as before ADR-1062: the founding row false, the list row true. Nothing resolves a price
    // through this flag (resolveStripePriceId ignores it), so the grant charges the founding id regardless.
    expect(rowFor('collective_base_year')?.archived).toBe(false)
    expect(rowFor('collective_base_year_list')?.archived).toBe(true)
  })

  it('the grant path resolves the beta annual Collective rate to a live price on the founding product', async () => {
    await syncPricingCatalogToStripe('op-1')
    // The key ADR-1061 names for @ishasetlumi: collective_base_year = $490, not the $790 list.
    const row = rowFor('collective_base_year')
    const price = priceById(row?.priceId)
    expect(price?.unit_amount).toBe(49000)
    expect(price?.active).toBe(true)
    expect(productById(row?.productId)?.metadata.frequency_product_line).toBe('founding')
  })
})

describe('a re-sync is idempotent', () => {
  it('running the sync twice creates no second product and no second price', async () => {
    const first = await syncPricingCatalogToStripe('op-1')
    const productsAfterFirst = store.products.map((p) => p.id)
    const pricesAfterFirst = store.prices.map((p) => p.id)
    const rowsAfterFirst = written.map((r) => `${r.key}:${r.productId}:${r.priceId}`)

    written.length = 0
    calls.productCreate.length = 0
    calls.priceCreate.length = 0

    const second = await syncPricingCatalogToStripe('op-1')
    expect(second.ok).toBe(true)
    expect(calls.productCreate).toEqual([])
    expect(calls.priceCreate).toEqual([])
    expect(store.products.map((p) => p.id)).toEqual(productsAfterFirst)
    expect(store.prices.map((p) => p.id)).toEqual(pricesAfterFirst)
    // Same keys, same products, same price ids: the second run is a pure re-resolve.
    expect(written.map((r) => `${r.key}:${r.productId}:${r.priceId}`)).toEqual(rowsAfterFirst)
    expect(second.synced.map((s) => s.key)).toEqual(first.synced.map((s) => s.key))
    // 5 items x 2 lines... only two items carry a founding rate, so: 5 standard + 2 founding products.
    expect(store.products).toHaveLength(7)
    expect(store.prices).toHaveLength(20)
  })

  it('a name drift on an existing product is corrected in place, never duplicated', async () => {
    await syncPricingCatalogToStripe('op-1')
    const founding = store.products.find((p) => p.metadata.frequency_pricing_key === 'collective_base_founding')!
    founding.name = 'stale name'
    calls.productCreate.length = 0
    await syncPricingCatalogToStripe('op-1')
    expect(calls.productCreate).toEqual([])
    expect(founding.name).toBe('Frequency Collective (Founding rate)')
  })
})
