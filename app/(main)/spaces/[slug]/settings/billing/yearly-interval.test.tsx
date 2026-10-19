import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanLadderRungs, type LadderRung } from './plan-ladder-rungs'

// LIVE-990: the yearly price /pricing advertises can be bought in the product. The checkout accepted
// `interval: 'year'` all along; the in-app buttons hardcoded 'month'. Now the ladder and the Go Business
// card carry a Monthly / Yearly switch and pass the choice to startSpaceLoadoutCheckout.

const DIR = 'app/(main)/spaces/[slug]/settings/billing'
const read = (f: string) => readFileSync(`${DIR}/${f}`, 'utf8')

const RUNGS: LadderRung[] = [
  {
    plan: 'business',
    icon: 'check',
    label: 'Business',
    blurb: 'Selling starts here.',
    price: { month: '$49/mo', year: '$490/yr' },
    note: { month: null, year: null },
    chip: null,
    choose: 'business',
  },
  {
    plan: 'collective',
    icon: 'users',
    label: 'Collective',
    blurb: 'Partner hub.',
    price: { month: '$99/mo', year: '$990/yr' },
    note: { month: 'Founding $99/mo, list $149/mo.', year: 'Founding $990/yr, list $1,490/yr.' },
    chip: null,
    choose: 'collective',
  },
]

describe('the in-app plan buttons sell the yearly interval (LIVE-990)', () => {
  it('the ladder shows the yearly prices and the Founding note in yearly terms', () => {
    const html = renderToStaticMarkup(<PlanLadderRungs slug="s" rungs={RUNGS} initialInterval="year" />)
    expect(html).toContain('$490/yr')
    expect(html).toContain('$990/yr')
    expect(html).toContain('Founding $990/yr, list $1,490/yr.')
    expect(html).not.toContain('$49/mo')
    expect(html).toContain('aria-label="Billing period"')
    expect(html).toContain('Choose Business')
  })

  it('defaults to monthly and hides the switch when nothing is choosable', () => {
    const monthly = renderToStaticMarkup(<PlanLadderRungs slug="s" rungs={RUNGS} />)
    expect(monthly).toContain('$49/mo')
    expect(monthly).not.toContain('$490/yr')
    const chips = RUNGS.map((r) => ({ ...r, choose: null, chip: { label: 'Your plan', className: '' } }))
    const noChoose = renderToStaticMarkup(<PlanLadderRungs slug="s" rungs={chips} />)
    expect(noChoose).not.toContain('aria-label="Billing period"')
    expect(noChoose).toContain('Your plan')
  })

  it('neither checkout button hardcodes the monthly interval any more', () => {
    for (const file of ['choose-plan.tsx', 'go-business.tsx']) {
      const src = read(file)
      expect(src, `${file} still sends interval: 'month'`).not.toMatch(/interval:\s*'month'/)
      expect(src, `${file} does not pass the chosen interval`).toMatch(/startSpaceLoadoutCheckout\(slug, \{[^}]*\binterval\b/)
    }
    expect(read('go-business.tsx')).toContain('BillingIntervalSwitch')
    expect(read('plan-ladder-rungs.tsx')).toContain('BillingIntervalSwitch')
  })
})
