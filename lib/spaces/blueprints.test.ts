import { describe, it, expect } from 'vitest'
import { blueprintForType, tabForSegment, allEntityModuleIds } from './blueprints'

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
    'entity-about',
    'entity-stats',
    'entity-offerings',
    'entity-practices',
    'entity-community',
    'entity-team',
    'entity-cta',
  ])

  const cases = [
    { type: 'business', typeLabel: 'Business', cta: 'Become a member', labels: ['About', 'Classes', 'Practices', 'Community', 'Join'], stats: ['members', 'offerings', 'circles'] },
    { type: 'organization', typeLabel: 'Organization', cta: 'Donate', labels: ['About', 'Programs', 'Practices', 'Community', 'Donate'], stats: ['members', 'offerings', 'circles'] },
    { type: 'coaching', typeLabel: 'Coaching', cta: 'Enroll', labels: ['About', 'Programs', 'Curriculum', 'Community', 'Enroll'], stats: ['members', 'practices', 'circles'] },
    { type: 'event_space', typeLabel: 'Event Space', cta: 'Get tickets', labels: ['About', 'Events', 'Practices', 'Community', 'Tickets'], stats: ['members', 'offerings', 'circles'] },
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

      it('declares its hero stat keys in order (members/offerings/practices/circles)', () => {
        expect(bp.heroStats.map((s) => s.metric)).toEqual([...c.stats])
        expect(bp.heroStats.length).toBeLessThanOrEqual(4)
      })

      it('opens with the about module so the index is never blank', () => {
        expect(bp.tabs[0]!.id).toBe('about')
        expect(bp.tabs[0]!.modules).toContain('entity-about')
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
