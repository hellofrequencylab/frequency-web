import { describe, it, expect } from 'vitest'
import { resolveSpaceMenu } from './space-menu'
import { SPACE_MODULES, spaceModuleManifest } from './space-modules'
import { APPS } from '@/lib/apps/catalog'
import { appGatePasses } from '@/lib/apps/access'
import type { AppViewer } from '@/lib/apps/types'
import { SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'

// docs/MODULAR-MENU.md — P1/P3. resolveSpaceMenu is the ONE gated Space-menu resolution the /manage
// console renders from. These lock its gating rule and, crucially, GUARD it against the standardized
// rail's parallel derivation (the App catalog's SPACE_EDITOR_APPS lane) so the two owner surfaces can
// never drift on WHICH modules the menu shows.

const allOn = (): boolean => true
const idsOf = (mods: readonly { id: string }[]) => mods.map((m) => m.id)

describe('resolveSpaceMenu gating', () => {
  it('with every function usable + menu-manage rights, returns the full catalog in order', () => {
    const menu = resolveSpaceMenu({ canUse: allOn, canManageMenu: true })
    expect(idsOf(menu)).toEqual(idsOf(spaceModuleManifest({})))
    expect(menu).toHaveLength(SPACE_MODULES.length)
  })

  it('drops a SERVICE module when its function is not usable', () => {
    const menu = resolveSpaceMenu(
      { canUse: (fn) => fn !== 'crm' && fn !== 'availability', canManageMenu: true },
      {},
    )
    const ids = idsOf(menu)
    expect(ids).not.toContain('space.crm')
    expect(ids).not.toContain('space.booking') // gates on `availability`
    expect(ids).toContain('space.people') // members still usable
    expect(ids).toContain('space.layout') // shell module, always on
  })

  it('keeps every SHELL module regardless of function access', () => {
    const menu = resolveSpaceMenu({ canUse: () => false, canManageMenu: true })
    const ids = idsOf(menu)
    for (const id of ['space.basics', 'space.layout', 'space.danger']) {
      expect(ids).toContain(id)
    }
  })

  it('honors the owner hide + order overrides (delegated to spaceModuleManifest)', () => {
    const menu = resolveSpaceMenu(
      { canUse: allOn, canManageMenu: true },
      { hidden: ['space.crm'], order: ['space.people', 'space.basics'] },
    )
    const ids = idsOf(menu)
    expect(ids).not.toContain('space.crm')
    expect(ids[0]).toBe('space.people')
    expect(ids[1]).toBe('space.basics')
  })
})

// ── DRIFT GUARD: the console (resolveSpaceMenu) and the rail (SPACE_EDITOR_APPS gated by the same usable
//    function set) must resolve the SAME module set. If a future change makes the App catalog gate a Space
//    module differently from the manifest, this fails. Both derive from SPACE_MODULES + the same per-viewer
//    `usableSpaceFunctions` set (carried on the Customize trigger as `spaceFns`).
describe('console/rail drift guard: same gated module set', () => {
  // The rail's Space editor Apps (catalog.ts SPACE_EDITOR_APPS): editor Apps scoped to a spaceType.
  const spaceEditorApps = APPS.filter(
    (a) => a.surfaces.editor != null && a.scopes.some((s) => s.on === 'spaceType'),
  )

  const railIds = (usable: Set<SpaceFunctionKey>): string[] => {
    const viewer: AppViewer = { caps: new Set(), canUseSpaceFn: (fn) => usable.has(fn as SpaceFunctionKey) }
    return spaceEditorApps.filter((a) => appGatePasses(a.gate, viewer)).map((a) => a.id)
  }

  // The rail always includes the always-on shell (gate 'none'), so compare with canManageMenu:true — the
  // one intentional difference is `space.modules` (console gates it on canManageMenu; the rail treats it as
  // an always-on shell). We compare the sets excluding that documented seam.
  const withoutMenuMgr = (ids: string[]) => ids.filter((id) => id !== 'space.modules')

  const cases: Array<[string, Set<SpaceFunctionKey>]> = [
    ['all functions on', new Set(SPACE_FUNCTIONS.map((f) => f.key))],
    ['none on', new Set()],
    ['a partial set', new Set<SpaceFunctionKey>(['crm', 'members', 'qr'])],
  ]

  for (const [name, usable] of cases) {
    it(`agrees on the module set (${name})`, () => {
      const consoleIds = idsOf(
        resolveSpaceMenu({ canUse: (fn) => usable.has(fn), canManageMenu: true }),
      )
      expect(new Set(withoutMenuMgr(consoleIds))).toEqual(new Set(withoutMenuMgr(railIds(usable))))
    })
  }

  it('every SERVICE module gate function is a known SPACE_FUNCTION (so the usable-set gate is total)', () => {
    const known = new Set(SPACE_FUNCTIONS.map((f) => f.key))
    for (const m of SPACE_MODULES) {
      if (m.gate.kind === 'feature') expect(known.has(m.gate.fn)).toBe(true)
    }
  })
})
