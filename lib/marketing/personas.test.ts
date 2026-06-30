import { describe, it, expect } from 'vitest'
import {
  PERSONAS,
  getPersona,
  personaSlugs,
  personaCopy,
  personaLoadout,
  personaMode,
  addonLabel,
} from './personas'
import {
  PERSONA_LOADOUTS,
  pricingTiers,
  tierHeadline,
  loadoutStrip,
  pricingLadderSummary,
  proAddonPrice,
  stripTotalLabel,
} from '@/lib/pricing/pricing-page'
import { resolveMode } from '@/lib/spaces/modes'

// Phase F (ADR-467): the PURE persona registry + the pricing-page model (no IO / no React / no Stripe).
// What is locked here:
//   1. The persona registry: unique slugs, every persona pins to a registered Mode, every persona has a
//      shared loadout entry, and the generated copy contains NO em dashes (the locked voice rule).
//   2. The loadout-strip math: each persona's monthly total matches the plan figures, computed from the
//      catalog (never hardcoded), so a catalog change reflows the page.

// A single source for the em-dash guard so every copy assertion uses the same rule.
function hasEmDash(s: string): boolean {
  return s.includes('—') || s.includes('–')
}

describe('persona registry', () => {
  it('has unique slugs', () => {
    const slugs = personaSlugs()
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.length).toBe(PERSONAS.length)
  })

  it('covers the six plan personas', () => {
    expect(personaSlugs().sort()).toEqual(
      ['coaches', 'event-spaces', 'nonprofits', 'product-businesses', 'service-businesses', 'studios'].sort(),
    )
  })

  it('getPersona resolves a known slug and rejects an unknown one', () => {
    expect(getPersona('coaches')?.audience).toBe('Coaches')
    expect(getPersona('not-a-persona')).toBeUndefined()
  })

  it('pins every persona to a registered Mode (no dead persona)', () => {
    for (const p of PERSONAS) {
      const mode = resolveMode(p.type, p.variant)
      expect(mode, `persona ${p.slug} -> ${p.type}:${p.variant}`).not.toBeNull()
      expect(personaMode(p)).not.toBeNull()
    }
  })

  it('has a shared loadout entry for every persona', () => {
    for (const p of PERSONAS) {
      const def = PERSONA_LOADOUTS.find((l) => l.slug === p.slug)
      expect(def, `loadout for ${p.slug}`).toBeDefined()
    }
  })
})

describe('persona copy is voice-compliant', () => {
  it('contains no em or en dashes anywhere in generated copy', () => {
    for (const p of PERSONAS) {
      const copy = personaCopy(p)
      const blobs = [
        copy.h1,
        copy.metaTitle,
        copy.description,
        copy.ogTitle,
        copy.lede,
        copy.loadoutLine,
        ...copy.faq.flatMap((f) => [f.q, f.a]),
        p.focus,
        ...p.highlights,
        p.audience,
      ]
      for (const b of blobs) {
        expect(hasEmDash(b), `em dash in ${p.slug}: "${b}"`).toBe(false)
      }
    }
  })

  it('puts the founding price into the loadout line and description', () => {
    for (const p of PERSONAS) {
      const copy = personaCopy(p)
      const total = stripTotalLabel(PERSONA_LOADOUTS.find((l) => l.slug === p.slug)!)
      expect(copy.loadoutLine).toContain(total)
      expect(copy.description).toContain(total)
    }
  })

  it('builds an H1 of the form "Frequency for <audience>"', () => {
    for (const p of PERSONAS) {
      expect(personaCopy(p).h1).toBe(`Frequency for ${p.audience}`)
    }
  })

  it('addonLabel maps a known add-on to its display label', () => {
    expect(addonLabel('ai')).toBe('AI Engine')
    expect(addonLabel('marketing')).toBe('Marketing')
  })
})

describe('loadout-strip math (computed from the catalog, never hardcoded)', () => {
  it('matches the plan figures: Coach $59, Service $39, Product $69, Studio $39, Event $19', () => {
    const expected: Record<string, string> = {
      coaches: '$59/mo',
      'service-businesses': '$39/mo',
      'product-businesses': '$69/mo',
      studios: '$39/mo',
      'event-spaces': '$19/mo',
    }
    const strip = loadoutStrip()
    for (const [slug, label] of Object.entries(expected)) {
      const row = strip.find((r) => r.id === slug)
      expect(row, slug).toBeDefined()
      expect(row!.totalLabel, slug).toBe(label)
    }
  })

  it('renders the Nonprofit row as a per-seat figure', () => {
    const np = loadoutStrip().find((r) => r.id === 'nonprofits')!
    expect(np.perSeat).toBe(true)
    expect(np.totalLabel).toBe('$12/seat/mo')
  })

  it('persona loadout total equals the strip total for the same slug', () => {
    for (const p of PERSONAS) {
      const row = personaLoadout(p)
      const stripRow = loadoutStrip().find((r) => r.id === p.slug)!
      expect(row.totalLabel).toBe(stripRow.totalLabel)
    }
  })
})

describe('pricing table model', () => {
  it('has the three commercial tiers with Pro featured', () => {
    const tiers = pricingTiers()
    expect(tiers.map((t) => t.id)).toEqual(['pro', 'nonprofit', 'organization'])
    expect(tiers.find((t) => t.id === 'pro')!.featured).toBe(true)
  })

  it('Pro headline reads $19/mo founding under a $29 list anchor', () => {
    const pro = pricingTiers().find((t) => t.id === 'pro')!
    expect(tierHeadline(pro, 'month')).toBe('$19/mo')
    expect(pro.price.month.listCents).toBe(2900)
  })

  it('Organization headline reads "from $199/mo"', () => {
    const org = pricingTiers().find((t) => t.id === 'organization')!
    expect(tierHeadline(org, 'month')).toBe('from $199/mo')
  })

  it('Nonprofit headline reads per seat', () => {
    const np = pricingTiers().find((t) => t.id === 'nonprofit')!
    expect(tierHeadline(np, 'month')).toBe('$12/seat/mo')
  })

  it('the four Pro add-on prices match the ladder', () => {
    expect(proAddonPrice('marketing')).toBe('+$20/mo')
    expect(proAddonPrice('ai')).toBe('+$20/mo')
    expect(proAddonPrice('team')).toBe('+$9/seat/mo')
    expect(proAddonPrice('branding')).toBe('+$30/mo')
  })

  it('the answer-engine ladder summary has no em dashes and lists every tier + add-on + Crew', () => {
    const lines = pricingLadderSummary()
    expect(lines.some((l) => l.includes('Pro:'))).toBe(true)
    expect(lines.some((l) => l.includes('Nonprofit:'))).toBe(true)
    expect(lines.some((l) => l.includes('Organization:'))).toBe(true)
    expect(lines.some((l) => l.includes('Crew:'))).toBe(true)
    for (const l of lines) expect(hasEmDash(l)).toBe(false)
  })
})
