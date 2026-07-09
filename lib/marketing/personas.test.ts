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

  it('covers the five persona doors (ADR-590)', () => {
    expect(personaSlugs().sort()).toEqual(
      ['coaches-and-healers', 'community-builders', 'event-hosts', 'nonprofits', 'studios'].sort(),
    )
  })

  it('getPersona resolves a known slug and rejects an unknown one', () => {
    expect(getPersona('coaches-and-healers')?.audience).toBe('Coaches and healers')
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

  it('addonLabel maps the add-on to its display label (Resonance Engine)', () => {
    expect(addonLabel('ai')).toBe('Resonance Engine')
  })
})

describe('loadout-strip math (computed from the catalog, never hardcoded)', () => {
  // ADR-590: the paid base is Business ($49); the Resonance Engine ($20) is the only add-on. Coaches/healers
  // and community builders turn it on ($69); studios and event hosts run on Business alone ($49).
  it('matches the doors: +Resonance personas $69, Business-only personas $49', () => {
    const expected: Record<string, string> = {
      'coaches-and-healers': '$69/mo',
      'community-builders': '$69/mo',
      studios: '$49/mo',
      'event-hosts': '$49/mo',
    }
    const strip = loadoutStrip()
    for (const [slug, label] of Object.entries(expected)) {
      const row = strip.find((r) => r.id === slug)
      expect(row, slug).toBeDefined()
      expect(row!.totalLabel, slug).toBe(label)
    }
  })

  it('renders the Nonprofit row as a flat $29/mo figure (ADR-590, never per seat)', () => {
    const np = loadoutStrip().find((r) => r.id === 'nonprofits')!
    expect(np.totalLabel).toBe('$29/mo')
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
  it('has the two commercial tiers with Business featured (ADR-552)', () => {
    const tiers = pricingTiers()
    expect(tiers.map((t) => t.id)).toEqual(['business', 'nonprofit'])
    expect(tiers.find((t) => t.id === 'business')!.featured).toBe(true)
  })

  it('Business headline reads $49/mo (list == founding today)', () => {
    const biz = pricingTiers().find((t) => t.id === 'business')!
    expect(tierHeadline(biz, 'month')).toBe('$49/mo')
    expect(biz.price.month.listCents).toBe(7900) // $79 founding anchor (ADR-591)
  })

  it('Non Profit headline reads $29/mo flat (ADR-590)', () => {
    const np = pricingTiers().find((t) => t.id === 'nonprofit')!
    expect(tierHeadline(np, 'month')).toBe('$29/mo')
  })

  it('the AI Engine add-on price matches the ladder (the only metered add-on, ADR-472)', () => {
    expect(proAddonPrice('ai')).toBe('+$20/mo')
  })

  it('every persona loadout uses only the AI Engine add-on (ADR-472)', () => {
    for (const l of PERSONA_LOADOUTS) {
      for (const addon of l.addons) expect(addon).toBe('ai')
    }
  })

  it('the answer-engine ladder summary has no em dashes and lists every tier + add-on + Crew', () => {
    const lines = pricingLadderSummary()
    expect(lines.some((l) => l.includes('Business:'))).toBe(true)
    expect(lines.some((l) => l.includes('Non Profit:'))).toBe(true)
    expect(lines.some((l) => l.includes('Crew:'))).toBe(true)
    for (const l of lines) expect(hasEmDash(l)).toBe(false)
  })
})
