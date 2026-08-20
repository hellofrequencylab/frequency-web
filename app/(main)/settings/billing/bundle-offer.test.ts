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

  it('the action still mounts createBundleCheckout (positive control for the chain)', () => {
    expect(actions).toContain("import { createBundleCheckout } from '@/lib/billing/bundle-checkout'")
    expect(actions).toContain('export async function startBundleCheckout')
    expect(actions).toContain('await createBundleCheckout(')
  })
})

describe('member copy holds the voice canon', () => {
  it('no em dashes in what the member reads (comments stripped)', () => {
    expect(strip(section)).not.toContain('—')
    expect(strip(controls)).not.toContain('—')
  })
})
