import { describe, it, expect } from 'vitest'
import {
  readModuleMenuPrefs,
  sanitizeModuleOrder,
  sanitizeHiddenModules,
} from './module-menu'

// ADR-546 (docs/MODULAR-MENU.md P3): the Module Manager's persisted menu overrides. These lock the
// fail-safe READ contract — a partial / stale / hostile blob never breaks a render and never lets the
// owner strand themselves (a hidden shell / Danger / Module Manager id is always dropped).

describe('readModuleMenuPrefs (fail-safe)', () => {
  it('returns empty lists for a missing / non-object / array preferences blob', () => {
    for (const bad of [undefined, null, 'nope', 42, [], [1, 2]]) {
      expect(readModuleMenuPrefs(bad as unknown)).toEqual({ order: [], hidden: [] })
    }
  })

  it('returns empty lists when the moduleMenu node is absent or malformed', () => {
    expect(readModuleMenuPrefs({})).toEqual({ order: [], hidden: [] })
    expect(readModuleMenuPrefs({ moduleMenu: null })).toEqual({ order: [], hidden: [] })
    expect(readModuleMenuPrefs({ moduleMenu: 'x' })).toEqual({ order: [], hidden: [] })
    expect(readModuleMenuPrefs({ moduleMenu: { order: 'x', hidden: 5 } })).toEqual({ order: [], hidden: [] })
  })

  it('keeps only known catalog ids, in order, de-duplicated', () => {
    const prefs = {
      moduleMenu: {
        order: ['space.crm', 'nope', 'space.crm', 'space.people', 42],
        hidden: ['space.booking', 'space.booking', 'ghost'],
      },
    }
    expect(readModuleMenuPrefs(prefs)).toEqual({
      order: ['space.crm', 'space.people'],
      hidden: ['space.booking'],
    })
  })

  it('drops UNHIDEABLE ids from the hidden list (shell / Danger / Module Manager can never be hidden)', () => {
    const prefs = {
      moduleMenu: {
        hidden: ['space.branding', 'space.basics', 'space.layout', 'space.settings', 'space.danger', 'space.modules', 'space.crm'],
      },
    }
    // Only the genuinely hideable service survives.
    expect(readModuleMenuPrefs(prefs).hidden).toEqual(['space.crm'])
  })

  it('preserves every OTHER preferences key untouched (reads only the moduleMenu node)', () => {
    const prefs = { profileLayout: { rows: [] }, moduleMenu: { order: ['space.crm'] } }
    expect(readModuleMenuPrefs(prefs)).toEqual({ order: ['space.crm'], hidden: [] })
  })
})

describe('sanitize helpers', () => {
  it('sanitizeModuleOrder allows any known id (order may list shell ids)', () => {
    expect(sanitizeModuleOrder(['space.branding', 'space.crm', 'bogus'])).toEqual(['space.branding', 'space.crm'])
    expect(sanitizeModuleOrder('not-an-array')).toEqual([])
  })

  it('sanitizeHiddenModules refuses unhideable ids', () => {
    expect(sanitizeHiddenModules(['space.danger', 'space.crm', 'space.branding'])).toEqual(['space.crm'])
  })
})
