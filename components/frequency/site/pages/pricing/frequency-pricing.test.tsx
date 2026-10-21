import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { catalogConfigByKey, defaultCatalogConfig } from '@/lib/pricing/catalog-config'
import { PRICING_DEFAULTS } from '@/lib/pricing/settings'
import { memberOfferings, spaceFeatureGrid, spaceOfferings, type PricingGridInput } from '@/lib/pricing/pricing-grid'
import { pricingFaq } from '@/app/(marketing)/pricing/pricing-faq'
import { pricingAddOns } from '@/lib/pricing/pricing-addons'
import { calculatorModel, intentsForPicks } from './calculator-model'
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
      yearlyNote="Yearly is two months free."
      calculator={calculatorModel(memberOfferings(input), spaceOfferings(input), input.catalog, 'Yearly is two months free.')}
      addOns={pricingAddOns(input)}
    />,
  )
}

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('the Frequency pricing body', () => {
  it('renders every section heading once', () => {
    const html = render()
    expect(count(html, 'Every feature, every plan.</h2>')).toBe(1)
    expect(count(html, 'Before you ask.</h2>')).toBe(1)
    expect(count(html, 'Join free. Host more with Crew.</h2>')).toBe(1)
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

describe('the motion graphics', () => {
  it('reads every figure off the catalog and links the right doors', () => {
    const html = render()
    expect(count(html, 'class="pm-fig"')).toBe(1)
    expect(html).toContain('$149 + $59 a chapter, 3 to start, from $326')
    expect(html).toContain('$30,000 a year plus a $5,000 setup')
    expect(html).toContain('href="/join?next=%2Fspaces%2Fnew%3Fplan%3Dbusiness"')
    expect(html).not.toMatch(/class="btn[^"]*" href="\/spaces"/)
    expect(html).toContain('mailto:')
  })
  it('stops every animation for reduced motion, and keeps violet out', () => {
    const css = readFileSync('app/themes/frequency/site-pages-b.css', 'utf8')
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{[^]*\.pm-float/)
    expect(css.slice(css.indexOf('THE PRICING MOTION GRAPHICS'))).not.toMatch(/5B3FD0|C4B8FF/i)
  })
})

describe('the scroll-through calculator', () => {
  const html = render()
  it('walks seven tiers and a picker, each with its own panel', () => {
    expect(html).toContain('id="path"')
    expect(count(html, 'pc-panel')).toBe(8)
    for (const tier of ['Visitor', 'Member', 'Crew', 'Free Space', 'Business', 'Collective', 'Network', 'Your turn'])
      expect(html).toContain(`>${tier}</p>`)
  })
  it('sits under the plan cards and steps with Back and Next', () => {
    expect(html.indexOf('id="spaces"')).toBeLessThan(html.indexOf('id="path"'))
    expect(html.indexOf('id="path"')).toBeLessThan(html.indexOf('id="collective-or-network"'))
    expect(html).toContain('aria-label="Previous step"')
    expect(html).toContain('aria-label="Next step"')
    expect(html).toContain('href="#path-end"')
    for (const act of ['Welcome', 'Become a Member', 'Join the Crew', 'Start a Free Space', 'Launch your Business', 'Create with the Collective', 'Expand your Network'])
      expect(html).toContain(`>${act}</p>`)
  })
  it('prices every step off the catalog, never the design file', () => {
    expect(html).toContain('<b>$49</b>')
    expect(html).toContain('<b>$99</b>')
    expect(html).toContain('<b>$149</b><em>/mo + $59 a chapter</em>')
    expect(html).toContain('<b>$4.99</b>')
    expect(html).not.toContain('$599')
    const calc = html.slice(html.indexOf('id="path"'), html.indexOf('</section>', html.indexOf('id="path"')))
    expect(calc).not.toMatch(/beta/i)
  })
  it('sends each button to a real door', () => {
    expect(html).toContain('href="/discover"')
    expect(html).toContain('href="/upgrade"')
    expect(html).toContain('href="/join"')
  })
  it('turns the picks into the goals Create a Space understands', () => {
    expect(intentsForPicks(['Classes', 'Circles', 'Retreats', 'Events'])).toBe('classes,community,events')
    expect(intentsForPicks([])).toBe('')
  })
})

describe('the add-ons', () => {
  const html = render()
  const rows = pricingAddOns(input)
  it('lists every extra with its catalog price', () => {
    expect(rows.paid.map((r) => r.key)).toEqual([
      'custom_domain',
      'vera_ai',
      'collective_space',
      'network_chapter',
      'network_package',
      'network_sites',
      'independent_network',
    ])
    expect(html).toContain('Custom domain')
    expect(html).toContain('$19')
    expect(html).toContain('$29')
    expect(html).toContain('$6,210')
    expect(html).toContain('$15 a site')
    expect(html).toContain('$5,000 once for setup')
  })
  it('says what comes with the plan, and the fee only on introductions', () => {
    expect(rows.included.map((r) => r.key)).toEqual(['qr', 'boost', 'crew', 'seats', 'tips'])
    expect(html).toContain('We only earn on a customer we introduce.')
    expect(html).toContain('0% on a customer Frequency introduces, plus card processing')
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

  it('gives every paid plan a yearly price behind the Monthly / Yearly switch', () => {
    const html = render()
    // The calculator's own Monthly / Yearly switch makes a third.
    expect(count(html, 'role="radiogroup"')).toBe(3)
    expect(html).toContain('aria-label="Billing period"')
    expect(html).toContain('data-period="month"')
    for (const o of spaceOfferings(input).filter((x) => x.monthlyCents > 0)) {
      expect(o.yearly, `${o.id} has no yearly price`).toBeTruthy()
    }
    expect(count(html, 'data-period-show="year"')).toBe(count(html, 'data-period-show="month"'))
  })
})
