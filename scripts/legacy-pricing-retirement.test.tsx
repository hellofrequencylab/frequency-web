import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { memberOfferings, spaceFeatureGrid, spaceOfferings, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingFaq } from '@/app/(marketing)/pricing/pricing-faq'
import { pricingAddOns } from '@/lib/pricing/pricing-addons'
import { calculatorModel } from '@/components/frequency/site/pages/pricing/calculator-model'
import { FrequencyPricing } from '@/components/frequency/site/pages/pricing/frequency-pricing'
import { activePricingMounted, RETIRED_PRICING_COMPARISON } from './probes/retired-pricing-comparison.mjs'
import { retiredModuleEdges } from './lib/retired-member-shell.mjs'

describe('active catalog-driven pricing survives legacy comparison retirement', () => {
  it('renders an operator catalog amount through actual offerings, calculator and Frequency body', () => {
    const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog: catalogConfigByKey(defaultCatalogConfig()) }
    input.values = { ...PRICING_DEFAULTS, plan: { ...PRICING_DEFAULTS.plan, business: { ...PRICING_DEFAULTS.plan.business, monthly_cents: 842100, list_cents: 842100, annual_cents: 8421000 } } }
    input.catalog.business_base = { ...input.catalog.business_base, month: { listCents: 842100, foundingCents: 842100 }, year: { listCents: 8421000, foundingCents: 8421000 } }
    const members = memberOfferings(input); const spaces = spaceOfferings(input)
    const html = renderToStaticMarkup(<FrequencyPricing members={members} spaces={spaces} grid={spaceFeatureGrid(input)} faq={pricingFaq(input)} yearlyNote="Yearly is two months free." calculator={calculatorModel(members, spaces, input.catalog, 'Yearly is two months free.')} addOns={pricingAddOns(input)} />)
    expect(html.replace(/<[^>]*>/g, '')).toContain('$8,421')
    expect(html).toContain('/spaces/new?plan=business')
  })
  it('fails the actual route mount when FrequencyPricing is removed', () => {
    const source = readFileSync('app/(marketing)/pricing/page.tsx', 'utf8')
    expect(activePricingMounted(source)).toBe(true)
    expect(activePricingMounted(source.replaceAll('<FrequencyPricing', '<MissingPricing'))).toBe(false)
  })
  it.each(RETIRED_PRICING_COMPARISON)('rejects reintroducing the actual route dependency %s', target => {
    const source = `import Retired from '@/${target.replace(/\.tsx?$/, '')}'\n${readFileSync('app/(marketing)/pricing/page.tsx', 'utf8')}`
    expect(retiredModuleEdges('app/(marketing)/pricing/page.tsx', source, RETIRED_PRICING_COMPARISON)).toHaveLength(1)
  })
})
