import { describe, it, expect } from 'vitest'
import { blueprintForType, tabForSegment, allEntityModuleIds } from './blueprints'

// PER-TYPE BLUEPRINT contract (ENTITY-SPACES-BUILD §B.3, Epic 1.3). Locks the Practitioner typed
// composition and the fail-closed behaviour for unknown types — pure data, no IO.

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
    expect(blueprintForType('event_space')).toBeNull()
    expect(blueprintForType('unknown')).toBeNull()
    expect(blueprintForType(null)).toBeNull()
    expect(blueprintForType(undefined)).toBeNull()
  })
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
