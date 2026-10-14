import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { memberOfferings, spaceFeatureGrid, spaceOfferings, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingFaq } from '@/app/(marketing)/pricing/pricing-faq'
import { FrequencyPricing, splitPrice } from './frequency-pricing'

// THE /pricing BODY ON FREQUENCY. A full-page capture showed "Every feature, every plan." and the FAQ
// twice; these pin that the body renders each once, and pin the plan card and the section rhythm the
// polish pass gave it (one featured card, a split price, no section zeroing its own top).

const input: PricingGridInput = { values: PRICING_DEFAULTS, catalog: catalogConfigByKey(defaultCatalogConfig()) }

function render() {
  return renderToStaticMarkup(
    <FrequencyPricing
      members={memberOfferings(input)}
      spaces={spaceOfferings(input)}
      grid={spaceFeatureGrid(input)}
      faq={pricingFaq(input)}
    />,
  )
}

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('the Frequency pricing body', () => {
  it('renders every section heading once', () => {
    const html = render()
    expect(count(html, 'Every feature, every plan.</h2>')).toBe(1)
    expect(count(html, 'Before you ask.</h2>')).toBe(1)
    expect(count(html, 'Everything for people is free.</h2>')).toBe(1)
    expect(count(html, '<table')).toBe(1)
  })

  it('lists each question once', () => {
    const html = render()
    const qs = [...html.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1])
    expect(qs.length).toBe(pricingFaq(input).length)
    expect(new Set(qs).size).toBe(qs.length)
  })

  it('crowns one plan, and every Space plan and personal tier gets a card', () => {
    const html = render()
    expect(count(html, 'class="pb-flag"')).toBe(1)
    expect(count(html, 'pop pb-plan')).toBe(spaceOfferings(input).length + memberOfferings(input).length + 1)
    // The featured column of the matrix is the featured card.
    expect(count(html, 'c is-feat"')).toBe(1)
  })

  it('never zeroes a section top (the eyebrow would sit on the fx seam)', () => {
    expect(render()).not.toContain('padding-top:0')
  })
})

describe('splitPrice', () => {
  it('splits the figure from its period, and keeps a lead word', () => {
    expect(splitPrice('$49/mo')).toEqual({ lead: undefined, amount: '$49', per: '/mo' })
    expect(splitPrice('from $4.99/mo')).toEqual({ lead: 'from', amount: '$4.99', per: '/mo' })
    expect(splitPrice('$1,490/yr')).toEqual({ lead: undefined, amount: '$1,490', per: '/yr' })
  })
  it('leaves a label with no figure whole', () => {
    expect(splitPrice('Free')).toEqual({ amount: 'Free' })
    expect(splitPrice('Set by the Space')).toEqual({ amount: 'Set by the Space' })
  })
})

describe('the pricing sheet', () => {
  const css = readFileSync('app/themes/frequency/site-pages-b.css', 'utf8')
  it('sticks the matrix header under the bar by its named height', () => {
    expect(css).toMatch(/\.pb-mx thead th\{position:sticky;top:var\(--fq-site-nav-h/)
    expect(readFileSync('app/themes/frequency/site-shell.css', 'utf8')).toContain('--fq-site-nav-h')
  })
  it('clips pricing sections without making a scroll box (which would unstick the header)', () => {
    expect(css).toMatch(/\.pb-sec\{[^}]*overflow:clip/)
  })
})
