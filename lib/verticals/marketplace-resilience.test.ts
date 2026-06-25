import { describe, it, expect } from 'vitest'
import { accessTo, ACCESS_MATRIX, type Surface } from '@/lib/core/access-matrix'
import { NAV_AREAS } from '@/lib/nav-areas'
import { VERTICALS, verticalNavPlacements } from '@/lib/verticals'

// Regression guard for the 2026-06-24 production /feed outage.
// Cause: a vertical registered a nav surface ('housing'/'maker'/'shop') that wasn't in the
// access matrix, so accessTo did `ACCESS_MATRIX[surface]` → undefined → `row[col]` TypeError,
// thrown inside the shared app shell's `NAV_AREAS.map(a => accessTo(a.surface, hats))` on every
// authenticated route. These tests lock in the three guarantees that make that impossible.

describe('access-matrix is crash-proof (incident 2026-06-24)', () => {
  const member = { loggedIn: true, role: 'member' as const }

  it('accessTo DEFAULT-DENIES an unknown surface instead of throwing', () => {
    expect(() => accessTo('totally-not-a-surface' as Surface, member)).not.toThrow()
    expect(accessTo('definitely-unregistered' as Surface, member)).toBe('none')
  })

  it('the exact shell call — map accessTo over every NAV_AREA surface — never throws', () => {
    expect(() =>
      NAV_AREAS.map((a) => (a.surface ? accessTo(a.surface as Surface, member) : 'full')),
    ).not.toThrow()
  })

  it('every surface a nav-area declares is registered in the access matrix', () => {
    for (const a of NAV_AREAS) {
      if (a.surface) expect(ACCESS_MATRIX[a.surface as Surface]).toBeDefined()
    }
  })

  it('the marketplace surfaces resolve to sane levels', () => {
    expect(accessTo('housing', member)).toBe('full')
    expect(accessTo('housing', { loggedIn: false })).toBe('none') // member-only
    expect(accessTo('maker', { loggedIn: false })).toBe('limited') // visitor preview
    expect(accessTo('shop', { loggedIn: false })).toBe('limited')
  })
})

// Activation (2026-06-25): housing/maker/shop went live once their schema reached prod.
// The crash-safety block above is what makes activation safe — these surfaces are
// registered, so mounting them into NAV_AREAS cannot throw in the shared shell. This
// block locks in that the activation actually happened (no silent regression to dormant).
describe('activated marketplace verticals mount into the shared shell', () => {
  it('housing / maker / shop are registered and enabled', () => {
    for (const id of ['housing', 'maker', 'shop']) {
      const v = VERTICALS.find((x) => x.id === id)
      expect(v, `${id} should be registered`).toBeDefined()
      expect(v?.enabled, `${id} should be active`).toBe(true)
    }
  })

  it('NAV_AREAS includes the marketplace verticals alongside market', () => {
    const keys = NAV_AREAS.map((a) => a.key)
    expect(keys).toContain('market')
    expect(keys).toContain('housing')
    expect(keys).toContain('maker')
    expect(keys).toContain('shop')
  })

  it('every marketplace surface in NAV_AREAS still resolves without throwing (the shell path)', () => {
    const member = { loggedIn: true, role: 'member' as const }
    for (const a of NAV_AREAS) {
      if (a.surface) expect(() => accessTo(a.surface as Surface, member)).not.toThrow()
    }
  })

  it('verticalNavPlacements emits every active vertical', () => {
    const keys = verticalNavPlacements().map((p) => p.area.key)
    expect(keys).toContain('market')
    expect(keys).toContain('housing')
    expect(keys).toContain('maker')
    expect(keys).toContain('shop')
  })
})
