// THE UPGRADE MOMENT'S OFFER (ADR-1709 §2, LIVE-758). What a price surface hands the panel in
// components/pricing/upgrade-moment.tsx: whether the Business checkout is live, the trial length, and
// the Business monthly price read from the catalog (never typed). Resolved on the server once per page;
// the panel itself stays a client leaf with no pricing engine behind it.
//
// FAIL-SAFE: an unreadable setting reads as "not sellable yet", so the panel shows "Keep it free" and
// a quiet "opens soon" instead of a trial button that would fail.

import { spaceLoadoutSellable } from '@/lib/billing/space-plan-checkout'
import { getPricingValues } from './settings'
import { loadCatalogConfig, catalogConfigByKey } from './catalog-config'

export interface UpgradeOffer {
  /** The Business checkout is live (billingLive AND the per-plan switch). */
  sellable: boolean
  /** The Space plan trial length in days (pricing_settings.trial). */
  trialDays: number
  /** The Business monthly price in cents, from the catalog, or null when it could not be read. */
  monthlyCents: number | null
}

/** Who the panel speaks to on one price surface. `spaceSlug` null is a personal host (Member or
 *  Crew), who cannot take payments on any tier; `canUpgrade` is true only for the Space's owner, the
 *  one person the plan checkout authorizes. */
export interface UpgradeTarget {
  spaceSlug: string | null
  canUpgrade: boolean
}

export async function loadUpgradeOffer(): Promise<UpgradeOffer> {
  const [sellable, values, catalog] = await Promise.all([
    spaceLoadoutSellable('business').catch(() => false),
    getPricingValues().catch(() => null),
    loadCatalogConfig().catch(() => null),
  ])
  const monthly = catalog ? catalogConfigByKey(catalog).business_base?.monthlyFoundingCents : undefined
  return {
    sellable,
    trialDays: values?.trial?.days ?? 0,
    monthlyCents: typeof monthly === 'number' && monthly > 0 ? monthly : null,
  }
}
