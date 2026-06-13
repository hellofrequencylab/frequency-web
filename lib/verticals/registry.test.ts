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

  // The descriptor is authoritative for a vertical's nav; this guards it against the live
  // literal until NAV_AREAS is flipped to source from the registry.
  it('declared nav areas exist in NAV_AREAS and match', () => {
    const live = new Map(NAV_AREAS.map((a) => [a.key, a]))
    const declared = verticalNavAreas()
    expect(declared.length).toBeGreaterThan(0)
    for (const area of declared) {
      const match = live.get(area.key)
      expect(match, `nav key "${area.key}" must exist in NAV_AREAS`).toBeTruthy()
      expect(match?.href).toBe(area.href)
      expect(match?.label).toBe(area.label)
      expect(match?.section).toBe(area.section)
      expect(match?.defaultAccess).toBe(area.defaultAccess)
    }
  })

  it('resolves namespaced module capabilities for a vertical scope', () => {
    expect(resolveVerticalCapabilities(member, { kind: 'market' }).has('market.listing.create')).toBe(true)
    // anonymous can't list
    expect(resolveVerticalCapabilities(anon, { kind: 'market' }).has('market.listing.create')).toBe(false)
    // unknown scope kind → empty (no leakage)
    expect(resolveVerticalCapabilities(member, { kind: 'unknown' }).size).toBe(0)
  })
})
