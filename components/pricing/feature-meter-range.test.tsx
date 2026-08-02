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

  it('shows the gauge-as-upsell nudge + See plans link once usage crosses the threshold (ADR-837)', () => {
    // Free CRM allowance is 250; 240 is past the 80% threshold.
    const out = html(
      <FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" usage={240} />,
    )
    expect(out).toContain('Nearly full. Move up a plan for a higher allowance.')
    expect(out).toContain('See plans')
  })

  it('keeps the nudge away below the threshold and on an unlimited tier', () => {
    const under = html(
      <FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" usage={12} />,
    )
    expect(under).not.toContain('Nearly full.')
    const unlimited = html(
      <FeatureMeterRange ladder={CRM} currentTier="business" upgradeHref="/spaces/x/settings/billing" usage={99999} />,
    )
    expect(unlimited).not.toContain('Nearly full.')
  })

  it('states nothing is charged or limited while billing is off, without calling the numbers a preview', () => {
    // PLACEHOLDER_ALLOWANCES is false now: these are the real allowances. The "nothing is limited yet"
    // line is about enforcement being off and must survive that flip on its own.
    const out = html(
      <FeatureMeterRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" live={false} />,
    )
    expect(out).toContain('Billing is not live yet')
    expect(out.toLowerCase()).toContain('nothing is charged or limited')
    expect(out.toLowerCase()).not.toContain('preview')
  })

  it('renders a personal (tier-axis) meter just as well', () => {
    const out = html(<FeatureMeterRange ladder={VERA} currentTier="free" upgradeHref="/upgrade" />)
    expect(out).toContain('role="radiogroup"')
    expect(out.match(/role="radio"/g)?.length).toBe(VERA.steps.length)
    expect(out).toContain('href="/upgrade"')
  })
})
