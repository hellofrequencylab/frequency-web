import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeatureTierRange } from './feature-tier-range'
import { featureTierLadder } from '@/lib/pricing/feature-tiers'

// FEATURE TIER RANGE render gate (ADR-518 Phase G). The selector renders under renderToStaticMarkup in
// the node env (initial state only; useEffect does not run, which is fine here). We assert it renders a
// rung per tier, an accessible radiogroup, the current tier highlighted, and a CTA that NAVIGATES (a
// link to the billing surface) rather than charging.

const CRM = featureTierLadder('space_crm')!
const VERA = featureTierLadder('vera_unlimited')!

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

describe('FeatureTierRange — renders the ladder per tier', () => {
  it('renders an accessible radiogroup with a rung + price per tier', () => {
    const out = html(
      <FeatureTierRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" />,
    )
    expect(out).toContain('role="radiogroup"')
    // A radio per rung (free, pro, business, organization = 4).
    expect(out.match(/role="radio"/g)?.length).toBe(CRM.steps.length)
    // Each tier label + placeholder price is present.
    for (const step of CRM.steps) {
      expect(out).toContain(step.label)
      expect(out).toContain(step.price)
    }
  })

  it('highlights the viewer current tier and never renders a charge control (link only)', () => {
    const out = html(
      <FeatureTierRange ladder={CRM} currentTier="pro" upgradeHref="/spaces/x/settings/billing" />,
    )
    // The current tier is marked.
    expect(out).toContain('Your plan')
    // The CTA is a navigation link to the billing surface, not a form / submit / checkout.
    expect(out).toContain('href="/spaces/x/settings/billing"')
    expect(out).not.toContain('<form')
    expect(out).not.toMatch(/type="submit"/)
    expect(out.toLowerCase()).not.toContain('checkout')
  })

  it('shows the honest placeholder-pricing note (billing not live) and nothing charges', () => {
    const out = html(
      <FeatureTierRange ladder={CRM} currentTier="free" upgradeHref="/spaces/x/settings/billing" live={false} />,
    )
    expect(out).toContain('Billing is not live yet')
    expect(out.toLowerCase()).toContain('nothing is charged')
  })

  it('renders a personal (tier-axis) ladder just as well', () => {
    const out = html(<FeatureTierRange ladder={VERA} currentTier="free" upgradeHref="/upgrade" />)
    expect(out).toContain('role="radiogroup"')
    expect(out.match(/role="radio"/g)?.length).toBe(VERA.steps.length)
    expect(out).toContain('href="/upgrade"')
  })
})
