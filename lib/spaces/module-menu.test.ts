import { describe, it, expect } from 'vitest'
import {
  readModuleMenuPrefs,
  sanitizeModuleOrder,
  sanitizeHiddenModules,
  sanitizeActivatedModules,
} from './module-menu'

// ADR-546 (docs/MODULAR-MENU.md P3): the Module Manager's persisted menu overrides. These lock the
// fail-safe READ contract — a partial / stale / hostile blob never breaks a render and never lets the
// owner strand themselves (a hidden shell / Danger / Module Manager id is always dropped).

describe('readModuleMenuPrefs (fail-safe)', () => {
  it('returns empty lists for a missing / non-object / array preferences blob', () => {
    for (const bad of [undefined, null, 'nope', 42, [], [1, 2]]) {
      expect(readModuleMenuPrefs(bad as unknown)).toEqual({ order: [], hidden: [], activated: [] })
    }
  })

  it('returns empty lists when the moduleMenu node is absent or malformed', () => {
    expect(readModuleMenuPrefs({})).toEqual({ order: [], hidden: [], activated: [] })
    expect(readModuleMenuPrefs({ moduleMenu: null })).toEqual({ order: [], hidden: [], activated: [] })
    expect(readModuleMenuPrefs({ moduleMenu: 'x' })).toEqual({ order: [], hidden: [], activated: [] })
    expect(readModuleMenuPrefs({ moduleMenu: { order: 'x', hidden: 5 } })).toEqual({ order: [], hidden: [], activated: [] })
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
      activated: [],
    })
  })

  it('reads the ACTIVATED list, keeping only ADVANCED ids (a non-advanced id is always shown)', () => {
    const prefs = {
      moduleMenu: {
        activated: ['space.automation', 'space.crm', 'space.automation', 'ghost'],
      },
    }
    // space.automation is advanced (activatable); space.crm is essential (always shown → dropped); dedup.
    expect(readModuleMenuPrefs(prefs).activated).toEqual(['space.automation'])
  })

  it('drops UNHIDEABLE ids from the hidden list (shell / Danger / Module Manager can never be hidden)', () => {
    const prefs = {
      moduleMenu: {
        hidden: ['space.basics', 'space.layout', 'space.danger', 'space.crm'],
      },
    }
    // Only the genuinely hideable service survives.
    expect(readModuleMenuPrefs(prefs).hidden).toEqual(['space.crm'])
  })

  it('preserves every OTHER preferences key untouched (reads only the moduleMenu node)', () => {
    const prefs = { profileLayout: { rows: [] }, moduleMenu: { order: ['space.crm'] } }
    expect(readModuleMenuPrefs(prefs)).toEqual({ order: ['space.crm'], hidden: [], activated: [] })
  })
})

describe('sanitize helpers', () => {
  it('sanitizeModuleOrder allows any known id (order may list shell ids)', () => {
    expect(sanitizeModuleOrder(['space.basics', 'space.crm', 'bogus'])).toEqual(['space.basics', 'space.crm'])
    expect(sanitizeModuleOrder('not-an-array')).toEqual([])
  })

  it('sanitizeHiddenModules refuses unhideable ids', () => {
    expect(sanitizeHiddenModules(['space.danger', 'space.crm', 'space.basics'])).toEqual(['space.crm'])
  })

  it('sanitizeActivatedModules keeps only ADVANCED ids (an always-shown module is a no-op to activate)', () => {
    // space.automation / space.airwaves are advanced; space.crm / space.booking are essential; ghost unknown.
    expect(
      sanitizeActivatedModules(['space.automation', 'space.crm', 'space.airwaves', 'space.booking', 'ghost']),
    ).toEqual(['space.automation', 'space.airwaves'])
    expect(sanitizeActivatedModules('nope')).toEqual([])
  })
})
