import { describe, it, expect } from 'vitest'
import {
  PERSONA_LOADOUTS,
  pricingTiers,
  tierHeadline,
  tierListAnchor,
  loadoutStrip,
  pricingLadderSummary,
  proAddonPrice,
} from './pricing-page'
import { spaceOfferings } from './pricing-grid'
import { PRICING_DEFAULTS } from './defaults'
import { pricingCatalog } from './pricing-page'

// The PURE pricing-page model: the tier table, the loadout-strip math, and the answer-engine ladder
// summary. No IO, no React, no Stripe.
//
// PROVENANCE (Phase 7 deletion sweep): these blocks used to live in lib/marketing/personas.test.ts,
// alongside tests for a SECOND persona registry (lib/marketing/personas.ts) that nothing imported.
// That orphan registry was deleted; this coverage was NOT, because it is the only test anywhere that
// locks pricingTiers / tierHeadline / tierListAnchor / loadoutStrip / proAddonPrice. It lives here, next
// to the module it covers, so a change to lib/pricing/pricing-page.ts is caught by a file named after it.

// A single source for the em-dash guard (the locked voice rule, docs/CONTENT-VOICE §10).
function hasEmDash(s: string): boolean {
  return s.includes('—') || s.includes('–')
}

describe('loadout-strip math (computed from the catalog, never hardcoded)', () => {
  // ADR-811: the paid base is Business at its $19 founding anchor; Vera AI ($20) is the only
  // add-on. Coaches/healers and community builders turn it on ($39); studios and event hosts run on
  // Business alone ($19). The strip headlines the FOUNDING total (the charged price).
  it('matches the doors: +Vera AI personas $39, Business-only personas $19 (founding)', () => {
    const expected: Record<string, string> = {
      'coaches-and-healers': '$39/mo',
      'community-builders': '$39/mo',
      studios: '$19/mo',
      'event-hosts': '$19/mo',
    }
    const strip = loadoutStrip()
    for (const [slug, label] of Object.entries(expected)) {
      const row = strip.find((r) => r.id === slug)
      expect(row, slug).toBeDefined()
      expect(row!.totalLabel, slug).toBe(label)
    }
  })

  it('renders the Nonprofit row as a flat $39/mo figure (ADR-811, never per seat)', () => {
    const np = loadoutStrip().find((r) => r.id === 'nonprofits')!
    expect(np.totalLabel).toBe('$39/mo')
  })

  it('every shared loadout row has a strip row of the same id (no dead loadout)', () => {
    const strip = loadoutStrip()
    for (const l of PERSONA_LOADOUTS) {
      expect(strip.find((r) => r.id === l.slug), l.slug).toBeDefined()
    }
  })
})

describe('pricing table model', () => {
  it('leads with Free Space and carries every tier through Independent (owner, 2026-07)', () => {
    const tiers = pricingTiers(true)
    expect(tiers.map((t) => t.id)).toEqual(['free', 'business', 'collective', 'nonprofit', 'independent'])
    // COLLECTIVE is the highlighted Space column: the DAWN 2 pricing reference the owner adopted
    // (design_handoff/dawn/ui_kits/marketing/pricing.html) crowns Crew + Collective "Best choice",
    // and no ADR names a different featured plan. Was `business` before the reference landed.
    expect(tiers.map((t) => [t.id, t.featured])).toContainEqual(['collective', true])
    expect(tiers.filter((t) => t.featured).map((t) => t.id)).toEqual(['collective'])
    // Phase 5 (ADR-916): the columns are DERIVED from pricing-grid spaceOfferings, so the table cannot
    // hold a tier the grid does not, or omit one it does. Independent is displayed on every public
    // surface; whether it is offered as an in-app UPGRADE is the plan ladder's own, separate call.
    for (const t of tiers) expect(t).not.toHaveProperty('preview')
  })

  it('the Free Space column reads Free at both intervals, with no anchor and no add-on cells', () => {
    const free = pricingTiers(true).find((t) => t.id === 'free')!
    expect(tierHeadline(free, 'month')).toBe('Free')
    expect(tierHeadline(free, 'year')).toBe('Free')
    expect(tierListAnchor(free, 'month')).toBeNull()
    expect(free.addons).toEqual([])
  })

  it('during beta: Collective reads a $49 beta struck under the $79 list (ADR-811)', () => {
    const col = pricingTiers(true).find((t) => t.id === 'collective')!
    expect(tierHeadline(col, 'month')).toBe('$49/mo')
    expect(tierListAnchor(col, 'month')).toBe('$79')
  })

  it('during beta: Business headline reads $19/mo struck under the $29 list (ADR-811)', () => {
    const biz = pricingTiers(true).find((t) => t.id === 'business')!
    expect(tierHeadline(biz, 'month')).toBe('$19/mo')
    expect(biz.price.month.listCents).toBe(2900) // $29 list
    expect(tierListAnchor(biz, 'month')).toBe('$29') // struck over the $19 beta anchor
  })

  it('after beta auto-revert: Business + Collective show list only, no strike (ADR-811)', () => {
    const tiers = pricingTiers(false) // beta window closed
    const biz = tiers.find((t) => t.id === 'business')!
    const col = tiers.find((t) => t.id === 'collective')!
    expect(tierHeadline(biz, 'month')).toBe('$29/mo')
    expect(tierListAnchor(biz, 'month')).toBeNull() // no anchor once beta ends
    expect(tierHeadline(col, 'month')).toBe('$79/mo')
    expect(tierListAnchor(col, 'month')).toBeNull()
  })

  it('Non Profit headline reads $39/mo flat regardless of the beta window (ADR-811)', () => {
    for (const beta of [true, false]) {
      const np = pricingTiers(beta).find((t) => t.id === 'nonprofit')!
      expect(tierHeadline(np, 'month')).toBe('$39/mo')
      expect(tierListAnchor(np, 'month')).toBeNull() // flat, never a beta discount
    }
  })

  it('the AI Engine add-on price matches the ladder (the only metered add-on, ADR-472)', () => {
    expect(proAddonPrice('ai')).toBe('+$20/mo')
  })

  it('every persona loadout uses only the AI Engine add-on (ADR-472)', () => {
    for (const l of PERSONA_LOADOUTS) {
      for (const addon of l.addons) expect(addon).toBe('ai')
    }
  })

  it('the answer-engine ladder summary has no em dashes and lists every tier + add-on + member prices', () => {
    const lines = pricingLadderSummary()
    expect(lines.some((l) => l.includes('Free Space:'))).toBe(true)
    expect(lines.some((l) => l.includes('Business:'))).toBe(true)
    expect(lines.some((l) => l.includes('Non Profit:'))).toBe(true)
    expect(lines.some((l) => l.includes('Independent:'))).toBe(true)
    // The member ladder is exactly Member (free) and Crew (ADR-878), and the citable summary says so.
    expect(lines.some((l) => l.includes('- Member: Free.'))).toBe(true)
    expect(lines.some((l) => l.includes('Crew:'))).toBe(true)
    expect(lines.some((l) => l.includes('Supporter'))).toBe(false)
    expect(lines.some((l) => l.includes('Vera AI'))).toBe(true)
    expect(lines.some((l) => l.includes('Operator seats:'))).toBe(true)
    for (const l of lines) expect(hasEmDash(l)).toBe(false)
  })
})

// ── The meta description has to FIT (ADR-919) ───────────────────────────────────────────────────
//
// /pricing's description was 372 characters, so every figure the derivation work produced sat past the
// ~155-160 character SERP cut and truncation began mid-sentence. The one thing that page exists to
// publish was the part nobody would ever read. Length is a correctness property here, not polish.
describe('the /pricing meta description fits in a search result', () => {
  it('stays under the SERP cut while still carrying the ladder', () => {
    const ladder = spaceOfferings({ values: PRICING_DEFAULTS, catalog: pricingCatalog(), betaActive: true })
      .filter((o) => o.monthlyCents > 0)
      .filter((o) => o.tier !== 'independent')
      .map((o) => `${o.label} ${o.monthly}`)
      .join(', ')
    const description = `We take nothing on your own people, ever. Selling is free on every plan. ${ladder}.`
    expect(description.length).toBeLessThanOrEqual(160)
    // And it must still be worth the space: the promise AND a real price.
    expect(description).toContain('nothing on your own people')
    expect(description).toMatch(/\$\d/)
  })
})
