// Server-side data for the /admin/pricing console (ADR-362, docs/PRICING.md). Reads the editable
// values, the flags, the feature-gate matrix (code defaults merged with the DB overrides), and the
// read-only Stripe status. EVERYTHING reads FAIL-SAFE to the seeded code defaults, so the page
// renders correct launch values even before the migration is applied / with billing OFF.

import { getPricingValues, loadPricingFlags, type PricingDefaults, type PricingFlagKey } from '@/lib/pricing/settings'
import { loadCatalogConfig, type CatalogConfig } from '@/lib/pricing/catalog-config'
import { FEATURE_GATES, loadFeatureGateOverrides, mergeGate, type FeatureGate } from '@/lib/pricing/gates'
import { billingEnabled } from '@/lib/billing/stripe'
import { loadStripePriceMap, type StripePriceRow } from '@/lib/billing/pricing-prices'
import { allPublicPriceKeys, allFounderPriceKeys, allCatalogPriceKeys } from '@/lib/billing/pricing-keys'

export interface FeatureGateRow {
  feature: string
  axis: FeatureGate['axis']
  minEntitlement: string
  enabled: boolean
  /** True when a DB row overrides the code default (shown as "customized"). */
  overridden: boolean
}

/** One row in the Stripe price map panel: the expected key + whether it's synced. */
export interface StripePriceRowView {
  key: string
  founder: boolean
  productId: string | null
  priceId: string | null
  synced: boolean
}

export interface PricingConsoleData {
  values: PricingDefaults
  /** The Phase C clean catalog config (operator overrides over the code catalog, ADR-463). */
  catalog: CatalogConfig
  flags: Record<PricingFlagKey, boolean>
  gates: FeatureGateRow[]
  stripe: {
    /** Stripe env keys present (billingEnabled). */
    configured: boolean
    /** The master billing_live flag. */
    masterLive: boolean
    /** Billing actually live (configured AND masterLive). */
    live: boolean
    /** The resolved Stripe Product/Price map (Pricing P2): every expected key + its synced state. */
    prices: StripePriceRowView[]
    /** How many of the legacy expected keys are synced. */
    syncedCount: number
    /** The clean Phase B catalog keys + their synced state (ADR-460/463). */
    catalogPrices: StripePriceRowView[]
    /** How many of the catalog keys are synced. */
    catalogSyncedCount: number
  }
}

export async function getPricingConsoleData(): Promise<PricingConsoleData> {
  const [values, catalog, flags, overrides, priceMap] = await Promise.all([
    getPricingValues(),
    loadCatalogConfig(),
    loadPricingFlags(),
    loadFeatureGateOverrides(),
    loadStripePriceMap(),
  ])

  // The feature->entitlement matrix: every code-declared feature, merged with any DB override, plus
  // any DB-only feature rows (a feature added in the table without a code default).
  const featureKeys = new Set<string>([...Object.keys(FEATURE_GATES), ...Object.keys(overrides)])
  const gates: FeatureGateRow[] = []
  for (const feature of featureKeys) {
    const gate = mergeGate(feature, overrides)
    if (!gate) continue
    gates.push({
      feature,
      axis: gate.axis,
      minEntitlement: String(gate.minEntitlement),
      enabled: gate.enabled,
      overridden: feature in overrides,
    })
  }
  gates.sort((a, b) => (a.axis === b.axis ? a.feature.localeCompare(b.feature) : a.axis.localeCompare(b.axis)))

  // The expected price catalog (public + founder variants) merged with what's actually synced.
  const expectedKeys = [...allPublicPriceKeys(), ...allFounderPriceKeys()]
  const prices: StripePriceRowView[] = expectedKeys.map((key) => {
    const row: StripePriceRow | undefined = priceMap[key]
    return {
      key,
      founder: key.endsWith('_founder'),
      productId: row?.stripe_product_id ?? null,
      priceId: row?.stripe_price_id ?? null,
      synced: !!row?.stripe_price_id,
    }
  })
  const syncedCount = prices.filter((p) => p.synced).length

  // The clean Phase B catalog keys (ADR-460): the founding (charged) + list (anchor) variants per item.
  const catalogPrices: StripePriceRowView[] = allCatalogPriceKeys().map((key) => {
    const row: StripePriceRow | undefined = priceMap[key]
    return {
      key,
      founder: !key.endsWith('_list'), // the founding (charged) price is the non-_list variant
      productId: row?.stripe_product_id ?? null,
      priceId: row?.stripe_price_id ?? null,
      synced: !!row?.stripe_price_id,
    }
  })
  const catalogSyncedCount = catalogPrices.filter((p) => p.synced).length

  const configured = billingEnabled()
  const masterLive = flags.billing_live
  return {
    values,
    catalog,
    flags,
    gates,
    stripe: {
      configured,
      masterLive,
      live: configured && masterLive,
      prices,
      syncedCount,
      catalogPrices,
      catalogSyncedCount,
    },
  }
}
