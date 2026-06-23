// Server-side data for the /admin/pricing console (ADR-362, docs/PRICING.md). Reads the editable
// values, the flags, the feature-gate matrix (code defaults merged with the DB overrides), and the
// read-only Stripe status. EVERYTHING reads FAIL-SAFE to the seeded code defaults, so the page
// renders correct launch values even before the migration is applied / with billing OFF.

import { getPricingValues, loadPricingFlags, type PricingDefaults, type PricingFlagKey } from '@/lib/pricing/settings'
import { FEATURE_GATES, loadFeatureGateOverrides, mergeGate, type FeatureGate } from '@/lib/pricing/gates'
import { billingEnabled } from '@/lib/billing/stripe'

export interface FeatureGateRow {
  feature: string
  axis: FeatureGate['axis']
  minEntitlement: string
  enabled: boolean
  /** True when a DB row overrides the code default (shown as "customized"). */
  overridden: boolean
}

export interface PricingConsoleData {
  values: PricingDefaults
  flags: Record<PricingFlagKey, boolean>
  gates: FeatureGateRow[]
  stripe: {
    /** Stripe env keys present (billingEnabled). */
    configured: boolean
    /** The master billing_live flag. */
    masterLive: boolean
    /** Billing actually live (configured AND masterLive). */
    live: boolean
  }
}

export async function getPricingConsoleData(): Promise<PricingConsoleData> {
  const [values, flags, overrides] = await Promise.all([
    getPricingValues(),
    loadPricingFlags(),
    loadFeatureGateOverrides(),
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

  const configured = billingEnabled()
  const masterLive = flags.billing_live
  return {
    values,
    flags,
    gates,
    stripe: { configured, masterLive, live: configured && masterLive },
  }
}
