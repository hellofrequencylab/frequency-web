import { describe, it, expect } from 'vitest'
import { VERTICALS, verticalById, verticalNavAreas, resolveVerticalCapabilities } from './registry'
import { NAV_AREAS } from '@/lib/nav-areas'
import type { Viewer } from '@/lib/core/capabilities'

const member: Viewer = { profileId: 'p1', role: 'member' }
const anon: Viewer = { profileId: null, role: 'member' }

describe('vertical registry (ADR-250 step 3/4)', () => {
  it('registers verticals with unique ids and lookup', () => {
    const ids = VERTICALS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(verticalById('market')?.entity).toBe('labs')
    expect(verticalById('does.not.exist')).toBeUndefined()
  })

  it('composes declared nav into NAV_AREAS at the anchored position', () => {
    const keys = NAV_AREAS.map((a) => a.key)
    // The commerce umbrella row is contributed by the descriptor. Its anchor moved from
    // 'events' to 'my-spaces' in the 2026-08-06 regroup, when commerce left the 11-row
    // Community group for its own **Market** group. The anchor is what keeps the three
    // commerce rows CONTIGUOUS: the shell groups by label but lib/menus/defaults groups by
    // consecutive RUN, so a Market row sitting mid-Community would fork a second Community
    // header in the code-default rail and not in the shell's. The two must agree.
    expect(keys).toContain('market')
    expect(keys.indexOf('market')).toBe(keys.indexOf('my-spaces') + 1)
    // Contiguous, in order: market -> housing -> shop, so both groupers see one run.
    expect(keys.indexOf('housing')).toBe(keys.indexOf('market') + 1)
    expect(keys.indexOf('shop')).toBe(keys.indexOf('housing') + 1)
    // And it carries through with its declared shape: since ADR-868 the id-`market` row IS
    // the commerce umbrella (menu row + /marketplace landing redirect only — the surfaces
    // keep their own names, Classifieds included). ADR-868 labelled it "Marketplace";
    // ADR-937 supersedes that label with the naming canon's **Market**. The KEY and HREF
    // deliberately still read `market` / `/marketplace` — only the human label moved, so a
    // regression that reverts the label cannot hide behind an unchanged route.
    const market = NAV_AREAS.find((a) => a.key === 'market')
    expect(market?.label).toBe('Market')
    expect(market?.href).toBe('/marketplace')
    // Its own group since the 2026-08-06 regroup (was 'Community', an 11-row bucket holding
    // places, commerce and people at once).
    expect(market?.section).toBe('Market')
    expect(verticalNavAreas().some((a) => a.key === 'market')).toBe(true)
  })

  it('resolves namespaced module capabilities for a vertical scope', () => {
    expect(resolveVerticalCapabilities(member, { kind: 'market' }).has('market.listing.create')).toBe(true)
    // anonymous can't list
    expect(resolveVerticalCapabilities(anon, { kind: 'market' }).has('market.listing.create')).toBe(false)
    // unknown scope kind → empty (no leakage)
    expect(resolveVerticalCapabilities(member, { kind: 'unknown' }).size).toBe(0)
  })
})

// The descriptor CONTRACT — the §6 guardrail, enforced in CI via the test suite. A vertical
// that violates these fails the build, so the registry can't quietly rot as verticals land.
describe('vertical descriptor contract (EXPANSION-FRAMEWORK §6)', () => {
  const ID_PATTERN = /^[a-z][a-z0-9]*$/

  for (const v of VERTICALS) {
    describe(`vertical: ${v.id}`, () => {
      it('has a lowercase, namespace-safe id', () => {
        expect(v.id).toMatch(ID_PATTERN)
      })

      it('declares a known entity (money partition)', () => {
        expect(['foundation', 'labs', 'partner', 'shared']).toContain(v.entity)
      })

      it('namespaces every capability under the vertical id', () => {
        for (const c of v.capabilities ?? []) {
          // The scope kind a vertical owns is its own id (its private scope namespace).
          expect(c.scopeKind).toBe(v.id)
          // Every capability string the resolver can emit must be prefixed with the id, so
          // it can never collide with the core Capability union or another vertical's space.
          for (const cap of c.resolve({ profileId: 'p', role: 'member' }, { kind: c.scopeKind })) {
            expect(cap.startsWith(`${v.id}.`)).toBe(true)
          }
        }
      })

      it('namespaces engagement source + event types under the vertical', () => {
        if (!v.engagement) return
        expect(v.engagement.source.length).toBeGreaterThan(0)
        for (const t of v.engagement.eventTypes) {
          expect(t.startsWith(`${v.id}.`)).toBe(true)
        }
      })
    })
  }
})
