import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Wiring guard: the Household bundle OFFER is mounted, buyable, and flag-gated (LIVE-062) ──────
// OWNER RULING (batch 6, 2026-08-20): startBundleCheckout was a deliberate mount of
// createBundleCheckout waiting for its purchase UI; this pins the wiring that landed. Source-level
// in the house archetype (app/(main)/walkthrough-actions.test.ts) because every failure here is
// SILENT at runtime: an unmounted offer card just never sells a bundle, and a dropped flag gate
// only shows once the platform flips billing on.

const DIR = 'app/(main)/settings/billing'
const section = readFileSync(`${DIR}/bundle-seats-section.tsx`, 'utf8')
const controls = readFileSync(`${DIR}/bundle-offer-controls.tsx`, 'utf8')
const actions = readFileSync(`${DIR}/actions.ts`, 'utf8')

/** Comments stripped, so copy assertions (voice canon) judge only what a member can read. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the flag gate stands in front of the offer', () => {
  it('the section reads bundleSellable() and returns null before anything renders', () => {
    expect(section).toContain("import { bundleSellable, getHouseholdBundle } from '@/lib/pricing/settings'")
    expect(section).toContain('if (!(await bundleSellable())) return null')
    // The gate runs BEFORE the offer can mount: switch off ⇒ the whole section, offer included,
    // renders nothing (the sibling billing idiom this surface already used).
    expect(section.indexOf('if (!(await bundleSellable())) return null')).toBeLessThan(
      section.indexOf('<BundleOffer />'),
    )
  })
})

describe('the offer card is mounted and calls the deliberate action', () => {
  it('the section mounts the offer with the buy control and the live config', () => {
    expect(section).toContain("import { BuyBundleButtons } from './bundle-offer-controls'")
    expect(section).toContain('<BundleOffer />')
    expect(section).toContain('await getHouseholdBundle()')
    expect(section).toContain('<BuyBundleButtons hasAnnual=')
  })

  it('the control calls startBundleCheckout and redirects to the Stripe URL', () => {
    expect(controls).toContain("import { startBundleCheckout } from './actions'")
    expect(controls).toContain('await startBundleCheckout(period)')
    expect(controls).toContain('window.location.href = r.data.url')
  })

  // The literal used to be `await createBundleCheckout(`. The await moved onto the viaStripe
  // wrapper when every Stripe reach in this file was made non-throwing (2026-08-20: an incomplete
  // Connect platform profile threw out of a payout action and the error boundary replaced the WHOLE
  // settings page). The chain is what this control is for, not the keyword, so it now pins the call
  // AND the guard the call must sit inside — strictly more than it asserted before.
  it('the action still mounts createBundleCheckout, inside the non-throwing guard', () => {
    expect(actions).toContain("import { createBundleCheckout } from '@/lib/billing/bundle-checkout'")
    expect(actions).toContain('export async function startBundleCheckout')
    expect(actions).toContain('createBundleCheckout({')
    expect(actions).toContain("viaStripe('startBundleCheckout'")
  })

  // 🔴 THE WHOLE POINT OF THE GUARD: one failing Stripe call must not take the page down with it.
  // Every action in this file reaches Stripe, and a StripeInvalidRequestError from a half-finished
  // dashboard is an ordinary outcome. If a future edit adds a fifth action or unwraps one of these
  // four, this fails rather than waiting for a member to find it.
  it('every Stripe reach in the file goes through viaStripe', () => {
    for (const label of [
      'openBillingPortal',
      'startBundleCheckout',
      'startPayoutOnboarding',
      'openPayoutDashboard',
    ]) {
      expect(actions).toContain(`viaStripe('${label}'`)
    }
    // viaStripe returns a value/error union rather than throwing: no bare `throw` may reappear.
    expect(actions).toContain('return { value: await run() }')
  })
})

describe('member copy holds the voice canon', () => {
  it('no em dashes in what the member reads (comments stripped)', () => {
    expect(strip(section)).not.toContain('—')
    expect(strip(controls)).not.toContain('—')
  })
})
