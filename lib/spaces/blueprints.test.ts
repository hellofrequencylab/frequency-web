import { describe, it, expect } from 'vitest'
import { blueprintForType, tabForSegment, allEntityModuleIds } from './blueprints'
import { SUPPORTED_ACCENT_TOKENS } from './accent'

// PER-TYPE BLUEPRINT contract (ENTITY-SPACES-BUILD §B.3, Epic 1.3). Locks the Practitioner typed
// composition and the fail-closed behaviour for unknown types. Pure data, no IO.

describe('blueprintForType', () => {
  it('returns the Practitioner blueprint with its tabs, CTA, and hero stats', () => {
    const bp = blueprintForType('practitioner')
    expect(bp).not.toBeNull()
    expect(bp!.typeLabel).toBe('Practitioner')
    // The tab set per §B.3: About · Offerings · Practices & Journeys · Community · Book.
    expect(bp!.tabs.map((t) => t.id)).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
    // The dynamic primary CTA is the plain verb "Book", routing to the book tab (§A.4).
    expect(bp!.primaryCta).toEqual({ label: 'Book', tab: 'book' })
    // Up to four hero StatCards.
    expect(bp!.heroStats.length).toBeGreaterThan(0)
    expect(bp!.heroStats.length).toBeLessThanOrEqual(4)
    // The hero leads with offerings (always-populated for a live practitioner), not sessions
    // (upcoming-only, which a mid-week profile may have zero of — §5, lead with a real stat).
    expect(bp!.heroStats[0]!.metric).toBe('offerings')
    // Warm amber default accent — the practitioner is the DAWN baseline (§1).
    expect(bp!.defaultAccent).toBe('--color-primary')
  })

  it('drops entity-stats from the About tab (the hero already shows the same numbers, §3 dedupe)', () => {
    const bp = blueprintForType('practitioner')!
    expect(bp.tabs[0]!.modules).not.toContain('entity-stats')
  })

  it('the About (index) tab includes the about module so a profile is never blank', () => {
    const bp = blueprintForType('practitioner')!
    expect(bp.tabs[0]!.id).toBe('about')
    expect(bp.tabs[0]!.modules).toContain('entity-about')
  })

  it('fails closed to null for an unknown / unregistered type', () => {
    // 'school' is a clearly fake type with no blueprint; unknown / absent types fall through.
    expect(blueprintForType('school')).toBeNull()
    expect(blueprintForType('unknown')).toBeNull()
    expect(blueprintForType(null)).toBeNull()
    expect(blueprintForType(undefined)).toBeNull()
  })
})

// ── Wave B role blueprints (Business · Organization · Coaching · Event Space, §2.5 - §2.8) ──────
// Each reuses the SAME seven entity modules + the same wired route segments as Practitioner; only
// the tab labels, the primary CTA label, the hero stat keys, and the order vary. Every CTA routes
// to a wired segment (book/offerings/practices/community), so no tab link 404s.

describe('Wave B blueprints (business / organization / coaching / event_space)', () => {
  // Every tab id MUST be a wired profile route segment (a page.tsx exists for it) so the tab row
  // never links to a 404. These are the segments live today.
  const WIRED_SEGMENTS = new Set(['about', 'offerings', 'practices', 'community', 'book'])
  // The only entity modules any blueprint may reference (lib/widgets/modules.ts SPACE_MODULE_IDS).
  const ENTITY_MODULES = new Set([
    'entity-getting-started',
    'entity-about',
    'entity-stats',
    'entity-offerings',
    'entity-practices',
    'entity-community',
    'entity-team',
    'entity-cta',
  ])

  // `aboutLead` = the FIRST module of the About tab (the role's headline section, §5 per-role
  // identity). `stats` = the hero stat keys IN ORDER (each role now leads with a stat it actually
  // has, never an always-zero metric, §5). `accent` = the per-role default brand accent (§1).
  const cases = [
    { type: 'business', typeLabel: 'Business', cta: 'Become a member', labels: ['About', 'Classes', 'Practices', 'Community', 'Join'], aboutLead: 'entity-offerings', stats: ['offerings', 'members', 'circles'], accent: '--color-broadcast' },
    { type: 'organization', typeLabel: 'Organization', cta: 'Donate', labels: ['About', 'Programs', 'Practices', 'Community', 'Donate'], aboutLead: 'entity-about', stats: ['offerings', 'members', 'circles'], accent: '--color-signal' },
    { type: 'coaching', typeLabel: 'Coaching', cta: 'Enroll', labels: ['About', 'Programs', 'Curriculum', 'Community', 'Enroll'], aboutLead: 'entity-practices', stats: ['practices', 'members', 'circles'], accent: '--color-info' },
    { type: 'event_space', typeLabel: 'Event Space', cta: 'Get tickets', labels: ['About', 'Events', 'Practices', 'Community', 'Tickets'], aboutLead: 'entity-offerings', stats: ['offerings', 'members', 'circles'], accent: '--color-warning' },
  ] as const

  for (const c of cases) {
    describe(c.type, () => {
      const bp = blueprintForType(c.type)!

      it('resolves to its blueprint with the right type label', () => {
        expect(bp).not.toBeNull()
        expect(bp.typeLabel).toBe(c.typeLabel)
      })

      it('declares the same five wired tab segments as Practitioner', () => {
        expect(bp.tabs.map((t) => t.id)).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
      })

      it('carries its role-specific tab labels', () => {
        expect(bp.tabs.map((t) => t.label)).toEqual([...c.labels])
      })

      it('routes its primary CTA verb to the wired book segment', () => {
        expect(bp.primaryCta).toEqual({ label: c.cta, tab: 'book' })
      })

      it('declares its hero stat keys in order, leading with a stat it actually has (§5)', () => {
        expect(bp.heroStats.map((s) => s.metric)).toEqual([...c.stats])
        expect(bp.heroStats.length).toBeLessThanOrEqual(4)
        // The first stat is never `members` (always zero before anyone joins) — every role leads
        // with content it publishes from day one (offerings / practices), §5.
        expect(bp.heroStats[0]!.metric).not.toBe('members')
      })

      it('opens with the about index tab, led by its role-specific headline module (§5)', () => {
        expect(bp.tabs[0]!.id).toBe('about')
        // The About tab still always carries the about prose (so the index is never blank)…
        expect(bp.tabs[0]!.modules).toContain('entity-about')
        // …it leads with the composite getting-started empty (renders only when the profile is empty,
        // §3), then the role's HEADLINE content module (a venue/business/non-profit leads with what
        // it does, not a generic bio), §5 per-role identity.
        expect(bp.tabs[0]!.modules[0]).toBe('entity-getting-started')
        expect(bp.tabs[0]!.modules[1]).toBe(c.aboutLead)
      })

      it('leads every browse tab with the getting-started composite empty (§3)', () => {
        for (const t of bp.tabs) {
          if (t.id === 'book') continue // the conversion tab has its own dedicated empty
          expect(t.modules[0]).toBe('entity-getting-started')
        }
      })

      it('drops entity-stats from the About tab (the hero shows the same numbers, §3 dedupe)', () => {
        expect(bp.tabs[0]!.modules).not.toContain('entity-stats')
      })

      it('uses only wired route segments and only the seven registered entity modules', () => {
        for (const t of bp.tabs) {
          expect(WIRED_SEGMENTS.has(t.id)).toBe(true)
          for (const m of t.modules) expect(ENTITY_MODULES.has(m)).toBe(true)
        }
      })

      it('reuses the same curated DAWN skin as Practitioner (no bespoke slug yet)', () => {
        expect(bp.defaultSkin).toBe(blueprintForType('practitioner')!.defaultSkin)
      })

      it('carries a per-role default accent the override can fully paint (§1)', () => {
        expect(bp.defaultAccent).toBe(c.accent)
        // The default must be a token lib/spaces/accent.ts can remap, else the role would fall back
        // to the host amber and lose its distinct color.
        expect(SUPPORTED_ACCENT_TOKENS.has(bp.defaultAccent)).toBe(true)
      })
    })
  }
})

describe('tabForSegment', () => {
  const bp = blueprintForType('practitioner')!

  it('resolves a known tab segment to its tab', () => {
    expect(tabForSegment(bp, 'offerings').id).toBe('offerings')
    expect(tabForSegment(bp, 'book').id).toBe('book')
  })

  it('falls back to the index (About) tab for an absent or unknown segment', () => {
    expect(tabForSegment(bp, undefined).id).toBe('about')
    expect(tabForSegment(bp, 'nope').id).toBe('about')
  })
})

describe('per-role default accents (§1 KEYSTONE — the five roles read distinct)', () => {
  const ROLES = ['practitioner', 'business', 'organization', 'coaching', 'event_space'] as const

  it('gives every role a supported default accent', () => {
    for (const r of ROLES) {
      const bp = blueprintForType(r)!
      expect(SUPPORTED_ACCENT_TOKENS.has(bp.defaultAccent)).toBe(true)
    }
  })

  it('assigns a DISTINCT default accent per role (so an un-customized profile differs by type)', () => {
    const accents = ROLES.map((r) => blueprintForType(r)!.defaultAccent)
    expect(new Set(accents).size).toBe(ROLES.length)
  })
})

describe('allEntityModuleIds', () => {
  it('is the de-duped union of every blueprint tab module (the registry must bind each)', () => {
    const ids = allEntityModuleIds()
    expect(new Set(ids).size).toBe(ids.length) // de-duped
    // Every Practitioner module appears.
    for (const id of ['entity-about', 'entity-offerings', 'entity-practices', 'entity-community', 'entity-cta']) {
      expect(ids).toContain(id)
    }
  })
})
