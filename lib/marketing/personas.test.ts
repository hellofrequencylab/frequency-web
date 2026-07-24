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
  tierListAnchor,
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
  // ADR-811: the paid base is Business at its $19 founding anchor; the Resonance Engine ($20) is the only
  // add-on. Coaches/healers and community builders turn it on ($39); studios and event hosts run on
  // Business alone ($19). The strip headlines the FOUNDING total (the charged price).
  it('matches the doors: +Resonance personas $39, Business-only personas $19 (founding)', () => {
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

  it('persona loadout total equals the strip total for the same slug', () => {
    for (const p of PERSONAS) {
      const row = personaLoadout(p)
      const stripRow = loadoutStrip().find((r) => r.id === p.slug)!
      expect(row.totalLabel).toBe(stripRow.totalLabel)
    }
  })
})

describe('pricing table model', () => {
  it('has the four commercial tiers, Business featured, none preview at go-live (ADR-811)', () => {
    const tiers = pricingTiers(true)
    expect(tiers.map((t) => t.id)).toEqual(['business', 'collective', 'nonprofit', 'independent'])
    expect(tiers.find((t) => t.id === 'business')!.featured).toBe(true)
    // GO-LIVE: all four tiers are sellable from the code catalog now; nothing is a preview row.
    for (const t of tiers) expect(t.preview).toBeFalsy()
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

  it('the answer-engine ladder summary has no em dashes and lists every tier + add-on + Crew', () => {
    const lines = pricingLadderSummary()
    expect(lines.some((l) => l.includes('Business:'))).toBe(true)
    expect(lines.some((l) => l.includes('Non Profit:'))).toBe(true)
    expect(lines.some((l) => l.includes('Crew:'))).toBe(true)
    for (const l of lines) expect(hasEmDash(l)).toBe(false)
  })
})
