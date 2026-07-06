import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeatureMeterRange } from './feature-meter-range'
import { featureMeter } from '@/lib/pricing/feature-meters'

// FEATURE METER RANGE render gate (ADR-519, metered model). The selector renders under renderToStaticMarkup
// in the node env (initial state only). We assert it renders a rung per tier, an accessible radiogroup, the
// current tier highlighted, the ALLOWANCE framing (never "unlock"/"locked"), an OPTIONAL usage readout, and
// a CTA that NAVIGATES (a link to the billing surface) rather than charging.

const CRM = featureMeter('space_crm')!
const VERA = featureMeter('vera_unlimited')!

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

describe('FeatureMeterRange — renders the allowance ladder per tier', () => {
  it('renders an accessible radiogroup with a rung + price per tier', () => {
    const out = html(<FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" />)
    expect(out).toContain('role="radiogroup"')
    expect(out.match(/role="radio"/g)?.length).toBe(CRM.steps.length)
    for (const step of CRM.steps) {
      expect(out).toContain(step.label)
      expect(out).toContain(step.price)
    }
  })

  it('frames tiers as allowances (pay to play), never as locked / unlock', () => {
    const out = html(<FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" />)
    // The allowance dimension header + an allowance line are present (ADR-552: the upgrade rung is
    // Business, whose CRM allowance is unlimited, so the line reads "Unlimited contacts").
    expect(out).toContain('allowance')
    expect(out).toMatch(/Up to|Unlimited contacts/)
    // No lock-wall language.
    expect(out.toLowerCase()).not.toContain('unlock')
    expect(out.toLowerCase()).not.toContain('locked')
    // The CTA is "upgrade for more", not a charge.
    expect(out).toContain('Upgrade for more')
  })

  it('highlights the viewer current tier and never renders a charge control (link only)', () => {
    const out = html(<FeatureMeterRange ladder={CRM} currentTier="pro" upgradeHref="/spaces/x/settings/billing" />)
    expect(out).toContain('Your plan')
    expect(out).toContain('href="/spaces/x/settings/billing"')
    expect(out).not.toContain('<form')
    expect(out).not.toMatch(/type="submit"/)
    expect(out.toLowerCase()).not.toContain('checkout')
  })

  it('renders the OPTIONAL usage readout when a count is passed', () => {
    const out = html(
      <FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" usage={12} />,
    )
    // "12 of N contacts used" for a finite free allowance.
    expect(out).toMatch(/12 of [\d,]+ contacts used/)
  })

  it('shows the honest placeholder note (billing not live) and states nothing is charged or limited', () => {
    const out = html(
      <FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" live={false} />,
    )
    expect(out).toContain('Billing is not live yet')
    expect(out.toLowerCase()).toContain('nothing is charged or limited')
  })

  it('renders a personal (tier-axis) meter just as well', () => {
    const out = html(<FeatureMeterRange ladder={VERA} currentTier="free" upgradeHref="/upgrade" />)
    expect(out).toContain('role="radiogroup"')
    expect(out.match(/role="radio"/g)?.length).toBe(VERA.steps.length)
    expect(out).toContain('href="/upgrade"')
  })
})
