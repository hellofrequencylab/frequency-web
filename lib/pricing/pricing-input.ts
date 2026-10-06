import { getPricingValues } from '@/lib/pricing/settings'
import { catalogConfigByKey, loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { isBetaPricingActive } from '@/lib/pricing/beta'
import { loadFeatureGateOverrides } from '@/lib/pricing/gates'
import type { PricingGridInput } from '@/lib/pricing/pricing-grid'

// THE ONE RESOLUTION of the pricing model from the operator-editable config (SCAN-793). /pricing,
// llms.txt and llms-full.txt each carried a private copy of this function while the what-is-frequency
// spec and the five /for doors read the code defaults at module load, so an /admin/pricing edit moved
// three surfaces and left two quoting the old fee. Every route that interpolates a price or a rate
// awaits this and hands the input to its spec. Server-only (it reads the database); the pure twin is
// `defaultPricingInput()` in pricing-page.ts.
//
// Two resolutions ride along (ADR-880), because a page that resolves either one differently from the
// product is a page that lies:
//  • `betaActive` is the SAME question the checkout asks (isBetaPricingActive()), so on the cutover
//    instant every surface moves to the list price in step with what Stripe starts charging.
//  • `gateOverrides` are the operator's live feature-gate rows, merged over the code map exactly the
//    way featureAllowed merges them, so a gate an operator RAISED cannot leave a page promising a
//    feature the product will refuse.
export async function loadPricingInput(): Promise<PricingGridInput> {
  const [values, catalog, gateOverrides] = await Promise.all([
    getPricingValues(),
    loadCatalogConfig(),
    loadFeatureGateOverrides(),
  ])
  return { values, catalog: catalogConfigByKey(catalog), betaActive: isBetaPricingActive(), gateOverrides }
}
