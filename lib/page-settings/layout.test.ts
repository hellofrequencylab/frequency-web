import { describe, it, expect } from 'vitest'
import {
  parseLayout,
  orderedModuleIds,
  resolveModuleIds,
  applyRoleGate,
  isLayoutScopeKey,
  layoutScopeChain,
  hasLayoutConfig,
  pickLayoutConfig,
  type LayoutConfig,
} from './layout'

const ALL = ['a', 'b', 'c', 'd'] as const
const cfg = (c: Partial<LayoutConfig>): LayoutConfig => ({ order: [], hidden: [], roles: {}, ...c })

describe('page-settings layout resolver', () => {
  it('parses jsonb safely (bad input → empty config)', () => {
    expect(parseLayout(null)).toEqual({ order: [], hidden: [], roles: {} })
    expect(parseLayout('nope')).toEqual({ order: [], hidden: [], roles: {} })
    expect(parseLayout([1, 2])).toEqual({ order: [], hidden: [], roles: {} })
    expect(parseLayout({ order: ['a', 3, 'b'], hidden: ['c'] })).toEqual({ order: ['a', 'b'], hidden: ['c'], roles: {} })
  })

  it('parses + validates the per-module roles map (drops non-ladder values)', () => {
    expect(parseLayout({ roles: { a: 'host', b: 'nope', c: 'mentor', d: 5 } }).roles).toEqual({ a: 'host', c: 'mentor' })
    expect(parseLayout({ roles: ['host'] }).roles).toEqual({})
  })

  it('honors the saved order, drops unknown ids, appends new modules in registry order', () => {
    expect(orderedModuleIds(cfg({ order: ['c', 'a', 'zzz'] }), ALL)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('de-dupes a repeated id in the saved order', () => {
    expect(orderedModuleIds(cfg({ order: ['b', 'b', 'a'] }), ALL)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('resolveModuleIds removes the hidden set', () => {
    expect(resolveModuleIds(cfg({ order: ['c', 'a'], hidden: ['a', 'd'] }), ALL)).toEqual(['c', 'b'])
  })

  it('default (empty config) = registry order, all visible', () => {
    expect(resolveModuleIds(cfg({}), ALL)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('per-module role gate', () => {
  const config = cfg({ roles: { b: 'host', d: 'mentor' } })

  it('drops gated modules below the viewer rung; keeps ungated', () => {
    expect(applyRoleGate(['a', 'b', 'c', 'd'], config, 'member')).toEqual(['a', 'c'])
    expect(applyRoleGate(['a', 'b', 'c', 'd'], config, 'host')).toEqual(['a', 'b', 'c'])
    expect(applyRoleGate(['a', 'b', 'c', 'd'], config, 'mentor')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('fail-closed: a null/unknown viewer role hides every gated module', () => {
    expect(applyRoleGate(['a', 'b', 'c', 'd'], config, null)).toEqual(['a', 'c'])
    expect(applyRoleGate(['a', 'b', 'c', 'd'], config, undefined)).toEqual(['a', 'c'])
  })

  it('no gates → everyone sees everything', () => {
    expect(applyRoleGate(['a', 'b'], cfg({}), 'member')).toEqual(['a', 'b'])
  })
})

describe('scope cascade', () => {
  it('recognises scope keys, rejects concrete routes', () => {
    expect(isLayoutScopeKey('*')).toBe(true)
    expect(isLayoutScopeKey('/lead/*')).toBe(true)
    expect(isLayoutScopeKey('/lead')).toBe(false)
    expect(isLayoutScopeKey('/lead/crew-tasks')).toBe(false)
    expect(isLayoutScopeKey('/a/b/*')).toBe(false) // only top-level section scopes
  })

  it('builds the most-specific-first chain: route → section → global', () => {
    expect(layoutScopeChain('/lead/crew-tasks')).toEqual(['/lead/crew-tasks', '/lead/*', '*'])
    expect(layoutScopeChain('/lead')).toEqual(['/lead', '/lead/*', '*'])
    expect(layoutScopeChain('/')).toEqual(['/', '*'])
  })

  it('hasLayoutConfig is true when any of order / hidden / roles is set', () => {
    expect(hasLayoutConfig(cfg({}))).toBe(false)
    expect(hasLayoutConfig(cfg({ order: ['a'] }))).toBe(true)
    expect(hasLayoutConfig(cfg({ hidden: ['a'] }))).toBe(true)
    expect(hasLayoutConfig(cfg({ roles: { a: 'host' } }))).toBe(true)
  })

  it('picks the most-specific level that carries an assignment (full override)', () => {
    const byKey = {
      '*': cfg({ order: ['a'] }),
      '/lead/*': cfg({ order: ['b'] }),
      '/lead': cfg({ order: ['c'] }),
    }
    expect(pickLayoutConfig(['/lead', '/lead/*', '*'], byKey).order).toEqual(['c'])
    expect(pickLayoutConfig(['/lead/x', '/lead/*', '*'], byKey).order).toEqual(['b'])
    expect(pickLayoutConfig(['/other', '/other/*', '*'], byKey).order).toEqual(['a'])
  })

  it('falls back to the registry default when nothing in the chain is set', () => {
    expect(pickLayoutConfig(['/x', '*'], { '/x': cfg({}), '*': cfg({}) })).toEqual({ order: [], hidden: [], roles: {} })
    expect(pickLayoutConfig(['/x', '*'], {})).toEqual({ order: [], hidden: [], roles: {} })
  })
})
