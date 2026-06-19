import { describe, it, expect } from 'vitest'
import {
  parseLayout,
  moduleAssignments,
  resolveSlots,
  isLayoutScopeKey,
  layoutScopeChain,
  hasLayoutConfig,
  pickLayoutConfig,
  spaceCacheKey,
  type LayoutConfig,
  type SlotConfig,
} from './layout'

const ALL = ['a', 'b', 'c', 'd'] as const
const slot = (s: Partial<SlotConfig> = {}): SlotConfig => ({ order: [], hidden: [], roles: {}, ...s })

describe('parseLayout', () => {
  it('bad input → empty Single layout', () => {
    expect(parseLayout(null)).toEqual({ template: 'single', slots: {} })
    expect(parseLayout('nope')).toEqual({ template: 'single', slots: {} })
    expect(parseLayout([1, 2])).toEqual({ template: 'single', slots: {} })
  })

  it('parses the { template, slots } shape, validating roles + template', () => {
    expect(
      parseLayout({ template: 'main-side', slots: { main: { order: ['a', 3], hidden: ['b'], roles: { a: 'host', x: 'nope' } } } }),
    ).toEqual({ template: 'main-side', slots: { main: { order: ['a'], hidden: ['b'], roles: { a: 'host' } } } })
    expect(parseLayout({ template: 'bogus', slots: {} }).template).toBe('single')
  })

  it('back-compat: a legacy flat config reads as the Single template main slot', () => {
    expect(parseLayout({ order: ['a', 'b'], hidden: ['b'], roles: { a: 'mentor' } })).toEqual({
      template: 'single',
      slots: { main: { order: ['a', 'b'], hidden: ['b'], roles: { a: 'mentor' } } },
    })
  })
})

describe('moduleAssignments', () => {
  it('places saved-order modules per slot, appends unplaced to the default (first) slot', () => {
    const cfg: LayoutConfig = { template: 'main-side', slots: { side: slot({ order: ['c'] }), main: slot({ order: ['b'] }) } }
    const got = moduleAssignments(cfg, ALL)
    expect(got.map((a) => [a.id, a.slot])).toEqual([
      ['b', 'main'], // main's placed
      ['c', 'side'], // side's placed
      ['a', 'main'], // unplaced → default slot (main)
      ['d', 'main'],
    ])
  })

  it('de-dupes across slots (first slot that lists a module wins) + drops unknown ids', () => {
    const cfg: LayoutConfig = { template: 'main-side', slots: { main: slot({ order: ['a', 'zzz'] }), side: slot({ order: ['a', 'b'] }) } }
    const got = moduleAssignments(cfg, ALL)
    expect(got.find((a) => a.id === 'a')?.slot).toBe('main')
    expect(got.find((a) => a.id === 'b')?.slot).toBe('side')
    expect(got.some((a) => a.id === 'zzz')).toBe(false)
  })

  it('carries enabled (from hidden) + role state', () => {
    const cfg: LayoutConfig = { template: 'single', slots: { main: slot({ order: ['a', 'b'], hidden: ['b'], roles: { a: 'host' } }) } }
    const got = moduleAssignments(cfg, ALL)
    expect(got.find((a) => a.id === 'a')).toMatchObject({ enabled: true, role: 'host' })
    expect(got.find((a) => a.id === 'b')).toMatchObject({ enabled: false, role: null })
  })

  it('empty config = all modules in the default slot, enabled, no gates', () => {
    const got = moduleAssignments({ template: 'single', slots: {} }, ALL)
    expect(got).toEqual([
      { id: 'a', slot: 'main', enabled: true, role: null },
      { id: 'b', slot: 'main', enabled: true, role: null },
      { id: 'c', slot: 'main', enabled: true, role: null },
      { id: 'd', slot: 'main', enabled: true, role: null },
    ])
  })
})

describe('resolveSlots', () => {
  it('returns visible ids per slot, dropping hidden + role-gated', () => {
    const cfg: LayoutConfig = {
      template: 'main-side',
      slots: {
        main: slot({ order: ['a', 'b'], hidden: ['b'], roles: {} }),
        side: slot({ order: ['c', 'd'], roles: { d: 'mentor' } }),
      },
    }
    expect(resolveSlots(cfg, ALL, 'member')).toEqual({ main: ['a'], side: ['c'] })
    expect(resolveSlots(cfg, ALL, 'mentor')).toEqual({ main: ['a'], side: ['c', 'd'] })
  })

  it('fail-closed: a null viewer role hides gated modules', () => {
    const cfg: LayoutConfig = { template: 'single', slots: { main: slot({ order: ['a', 'b'], roles: { b: 'host' } }) } }
    expect(resolveSlots(cfg, ALL, null)).toEqual({ main: ['a', 'c', 'd'] })
  })
})

describe('scope cascade', () => {
  it('recognises scope keys, rejects concrete routes', () => {
    expect(isLayoutScopeKey('*')).toBe(true)
    expect(isLayoutScopeKey('/lead/*')).toBe(true)
    expect(isLayoutScopeKey('/lead')).toBe(false)
    expect(isLayoutScopeKey('/a/b/*')).toBe(false)
  })

  it('builds the most-specific-first chain', () => {
    expect(layoutScopeChain('/lead/crew-tasks')).toEqual(['/lead/crew-tasks', '/lead/*', '*'])
    expect(layoutScopeChain('/lead')).toEqual(['/lead', '/lead/*', '*'])
    expect(layoutScopeChain('/')).toEqual(['/', '*'])
  })

  it('hasLayoutConfig: a non-default template or any slot assignment counts', () => {
    expect(hasLayoutConfig({ template: 'single', slots: {} })).toBe(false)
    expect(hasLayoutConfig({ template: 'main-side', slots: {} })).toBe(true)
    expect(hasLayoutConfig({ template: 'single', slots: { main: slot({ order: ['a'] }) } })).toBe(true)
    expect(hasLayoutConfig({ template: 'single', slots: { main: slot({ roles: { a: 'host' } }) } })).toBe(true)
  })

  it('picks the most-specific level that carries an assignment (full override)', () => {
    const byKey = {
      '*': { template: 'two-col', slots: {} } as LayoutConfig,
      '/lead/*': { template: 'main-side', slots: {} } as LayoutConfig,
      '/lead': { template: 'three-col', slots: {} } as LayoutConfig,
    }
    expect(pickLayoutConfig(['/lead', '/lead/*', '*'], byKey).template).toBe('three-col')
    expect(pickLayoutConfig(['/lead/x', '/lead/*', '*'], byKey).template).toBe('main-side')
    expect(pickLayoutConfig(['/other', '/other/*', '*'], byKey).template).toBe('two-col')
  })

  it('falls back to the empty Single default when nothing in the chain is set', () => {
    expect(pickLayoutConfig(['/x', '*'], {})).toEqual({ template: 'single', slots: {} })
  })
})

describe('space layer (Phase 0.5a)', () => {
  // The cascade gains a top layer: space -> route -> section -> global. The space dimension is
  // the query filter; within a space the existing chain decides most-specific-wins.
  it('spaceCacheKey is unique per (space, route) — the cross-tenant cache-leak guard', () => {
    const a = 'aaaaaaaa-0000-4000-a000-000000000001'
    const b = 'bbbbbbbb-0000-4000-a000-000000000002'
    // Same route, different space → different cache keys (A's layout never serves from B's slot).
    expect(spaceCacheKey(a, '/feed')).not.toBe(spaceCacheKey(b, '/feed'))
    // Same space, different route → different keys.
    expect(spaceCacheKey(a, '/feed')).not.toBe(spaceCacheKey(a, '/crew'))
    // Stable + deterministic for the same inputs (so React.cache memoizes correctly).
    expect(spaceCacheKey(a, '/feed')).toBe(spaceCacheKey(a, '/feed'))
    // The space id leads the key, then the route.
    expect(spaceCacheKey(a, '/feed')).toBe(`${a}::/feed`)
  })

  it('within one space, the route/section/global chain is unchanged (root behaves as today)', () => {
    // Canary: the single-tenant cascade math is exactly the pre-space behavior — the space
    // layer is the row filter, not a change to how route beats section beats global.
    const byKey = {
      '*': { template: 'two-col', slots: {} } as LayoutConfig,
      '/lead/*': { template: 'main-side', slots: {} } as LayoutConfig,
      '/lead': { template: 'three-col', slots: {} } as LayoutConfig,
    }
    expect(pickLayoutConfig(layoutScopeChain('/lead'), byKey).template).toBe('three-col')
    expect(pickLayoutConfig(layoutScopeChain('/lead/x'), byKey).template).toBe('main-side')
    expect(pickLayoutConfig(layoutScopeChain('/other'), byKey).template).toBe('two-col')
  })
})
