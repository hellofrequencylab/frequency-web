import { getPricingValues } from '@/lib/pricing/settings'
import { loadCatalogConfig, catalogConfigByKey } from '@/lib/pricing/catalog-config'
import { isBetaPricingActive } from '@/lib/pricing/beta'
import { allOfferings } from '@/lib/pricing/pricing-grid'

// ── LIVE PRICING FOR CMS BLOCKS (ADR-918) ───────────────────────────────────────────────────────
//
// 🔴 THE PROBLEM THIS EXISTS TO CLOSE. The `Tiers` block stores `price`, `strikePrice`, `cadence` and
// `priceNote` as FREE TEXT a janitor types, and a published page freezes that text into a jsonb
// document. So the first time anyone published a pricing page, every figure on it became a snapshot,
// and an operator changing a rate at /admin/pricing would move the generated page while the published
// one kept quoting last quarter's numbers.
//
// That is the exact failure the value-ladder work spent a phase undoing: nine structures each holding
// their own copy of the prices, six of which could disagree. Wiring the CMS to render published
// content without this would have re-forked the source on the very next Publish, and worse than
// before, because a jsonb document in a database is far less visible than a constant in a file.
//
// THE RULE: a janitor edits the WORDS. The NUMBERS stay derived. A tier card binds to an offering id
// and its price, struck anchor, cadence and rate are resolved at render from the same config the
// checkout bills on. The typed fields remain for genuinely editorial cards (an add-on, a
// "Space Memberships: Owner-set" card) that have no offering behind them.

/** One offering's resolved figures, keyed by the id a CMS card binds to. */
export interface LivePriceRow {
  label: string
  /** The display price today ("Free", "$19/mo"), through the beta window. */
  price: string
  /** The struck list anchor when the tier is genuinely under one, else null. */
  strikePrice: string | null
  yearly: string | null
  /** The plain rate sentence, e.g. "0% on your own people, 10% on network-sourced sales". */
  takeRate: string
}

export type LivePricing = Record<string, LivePriceRow>

/** Resolve every sellable offering into CMS-bindable figures. Server-only (reads operator config).
 *
 *  FAIL-SAFE: any read failure returns `{}` rather than throwing, and an unbound card falls back to
 *  its typed text. A pricing page that renders a slightly stale figure is recoverable; one that throws
 *  during static generation takes the whole route down. */
export async function getLivePricing(): Promise<LivePricing> {
  try {
    const [values, catalogRows] = await Promise.all([getPricingValues(), loadCatalogConfig()])
    const offerings = allOfferings({
      values,
      catalog: catalogConfigByKey(catalogRows),
      betaActive: isBetaPricingActive(),
    })
    const out: LivePricing = {}
    for (const o of offerings) {
      out[o.id] = {
        label: o.label,
        price: o.monthly,
        strikePrice: o.listAnchor ?? null,
        yearly: o.yearly ?? null,
        takeRate: o.takeRate,
      }
    }
    return out
  } catch {
    return {}
  }
}
