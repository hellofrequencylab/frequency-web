import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { data as PRICING_TEMPLATE } from './templates/pricing'
import { allOfferings } from '@/lib/pricing/pricing-grid'
import { PRICING_DEFAULTS } from '@/lib/pricing/defaults'
import { pricingCatalog } from '@/lib/pricing/pricing-page'

// ── A PUBLISHED PAGE MUST NOT FREEZE A PRICE (ADR-918) ──────────────────────────────────────────
//
// The `Tiers` block stores price, strikePrice and cadence as free text a janitor types, and Publish
// writes that text into a jsonb document. So the first Publish of a pricing page turned every figure
// on it into a snapshot: an operator editing a rate at /admin/pricing would move the generated page
// while the published one kept quoting the old number.
//
// That is precisely the failure this codebase spent a phase removing — nine structures each holding
// their own copy of the prices, six of which could disagree — and it would have come back somewhere
// far harder to notice, because a row in a database is not greppable and no test can read it.
//
// So the invariant is enforced HERE, on the seed document, which is the one part of the chain that
// lives in git: every card that represents a real offering must bind to it.

type Block = { type?: string; props?: Record<string, unknown> }
type Tier = { name?: string; livePriceKey?: string; price?: string }

const blocks = (PRICING_TEMPLATE.content ?? []) as Block[]
const tierCards: Tier[] = blocks
  .filter((b) => b.type === 'Tiers')
  .flatMap((b) => ((b.props?.items as Tier[] | undefined) ?? []))

/** The offering ids the live resolver can actually produce. */
const offeringIds = new Set(
  allOfferings({ values: PRICING_DEFAULTS, catalog: pricingCatalog(), betaActive: true }).map((o) => o.id),
)

describe('the seeded pricing document binds its tiers to live figures', () => {
  it('has tier cards at all (a template that lost them would pass everything below vacuously)', () => {
    expect(tierCards.length).toBeGreaterThan(5)
  })

  it('every card naming a real tier carries a livePriceKey', () => {
    // Cards WITHOUT a key are legitimate and expected: an add-on, or "Space Memberships: Owner-set",
    // has no offering behind it. What must never happen is a card called "Business" quoting a typed
    // price with nothing tying it to the Business offering.
    const REAL = ['Member', 'Crew', 'Free Space', 'Business', 'Collective', 'Non Profit', 'Independent']
    for (const card of tierCards) {
      if (!card.name || !REAL.includes(card.name)) continue
      expect(
        card.livePriceKey,
        `the "${card.name}" card has no livePriceKey, so publishing this page would freeze its price ` +
          `into the document and an /admin/pricing edit would stop reaching it`,
      ).toBeTruthy()
    }
  })

  it('every livePriceKey resolves to an offering that actually exists', () => {
    // A renamed offering would silently fall back to the typed text, which is the safe direction but
    // means the binding has quietly stopped working. This catches that at build time instead.
    for (const card of tierCards) {
      if (!card.livePriceKey) continue
      expect(
        offeringIds.has(card.livePriceKey),
        `livePriceKey "${card.livePriceKey}" on the "${card.name}" card matches no offering. ` +
          `Known ids: ${[...offeringIds].join(', ')}`,
      ).toBe(true)
    }
  })
})

describe('the binding fails in the editorial direction', () => {
  const SRC = readFileSync('components/page-editor/blocks/collections.tsx', 'utf8')

  it('an unresolved key falls back to the typed text rather than blanking the card', () => {
    // A pricing card that renders empty is worse than one showing a slightly stale figure: the first
    // looks broken to every visitor, the second looks fine and is fixed by a redeploy.
    expect(SRC).toContain('const live = raw.livePriceKey ? livePricing?.[raw.livePriceKey] : undefined')
    expect(SRC).toMatch(/const tier: TierItem = live[\s\S]{0,160}: raw/)
  })

  it('the resolver never throws into static generation', () => {
    // getLivePricing reads operator config during prerender. A throw there takes the whole route down
    // at build time, so it returns {} on any failure and every card falls back.
    const resolver = readFileSync('lib/page-editor/live-pricing.ts', 'utf8')
    expect(resolver).toMatch(/catch \{\s*return \{\}/)
  })
})

describe('the CMS route actually receives the live data', () => {
  it('/pricing renders published content and passes metadata through', () => {
    const page = readFileSync('app/(marketing)/pricing/page.tsx', 'utf8')
    expect(page).toContain('getPublishedData')
    expect(page).toContain('getLiveData')
    expect(page).toMatch(/metadata=\{live \? \{ live \} : \{\}\}/)
  })

  it('pricing rides on LiveData, so every Puck page gets it, not just /pricing', () => {
    // The other CMS pages can carry a Tiers block too. Threading pricing through the shared LiveData
    // rather than a /pricing-only prop is what makes that safe.
    const liveData = readFileSync('lib/page-editor/live-data.ts', 'utf8')
    expect(liveData).toContain('getLivePricing()')
    expect(liveData).toMatch(/return \{\s*\n\s*pricing,/)
  })
})
