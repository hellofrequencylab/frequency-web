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

describe('dormant verticals do not mount into the shared shell', () => {
  it('housing / maker / shop are registered but enabled:false', () => {
    for (const id of ['housing', 'maker', 'shop']) {
      const v = VERTICALS.find((x) => x.id === id)
      expect(v, `${id} should be registered`).toBeDefined()
      expect(v?.enabled, `${id} should be dormant`).toBe(false)
    }
  })

  it('NAV_AREAS contains no dormant vertical (shell is byte-unchanged), but keeps market', () => {
    const keys = NAV_AREAS.map((a) => a.key)
    expect(keys).not.toContain('housing')
    expect(keys).not.toContain('maker')
    expect(keys).not.toContain('shop')
    expect(keys).toContain('market')
  })

  it('verticalNavPlacements only emits enabled verticals', () => {
    const keys = verticalNavPlacements().map((p) => p.area.key)
    expect(keys).toContain('market')
    expect(keys).not.toContain('housing')
  })
})
