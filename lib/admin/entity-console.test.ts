import { describe, it, expect } from 'vitest'
import { resolveEntityConsole } from './entity-console'
import { appsForScope } from '@/lib/apps/for-scope'
import { APPS } from '@/lib/apps/catalog'
import { modulesForScopeKind, type ScopeKind } from '@/lib/admin/modules/registry'
import type { AppViewer } from '@/lib/apps/types'

// Admin-menu standardization. resolveEntityConsole is the ONE resolver the core-entity /manage consoles
// (circle · hub · nexus · practice) render from. These lock its behavior and, crucially, GUARD it against
// the standardized RAIL's module resolution (settings-panel's `settingsAppsFor`, also `appsForScope(scope,
// viewer, 'editor')`) so the two owner surfaces for a core entity can never drift on WHICH modules show —
// the twin of space-menu.test.ts's console/rail drift guard for the Space menu.

// A caps-BLIND viewer that passes every editor App's own gate — exactly how settings-panel resolves the
// rail's manage-module list (each module self-gates server-side), so the console set resolved for this
// viewer must equal the rail's caps-blind catalog set (modulesForScopeKind).
const SELECTION_VIEWER: AppViewer = {
  caps: new Set(
    APPS.flatMap((a) => (a.surfaces.editor && a.gate.system === 'capability' ? [a.gate.capability] : [])),
  ),
}

const idsOf = (apps: readonly { id: string }[]) => apps.map((a) => a.id)

// The core entities now on the shared unified console (event keeps its own thin Basics + Danger console).
const CONSOLE_ENTITIES: ScopeKind[] = ['circle', 'hub', 'nexus', 'practice']

describe('resolveEntityConsole — console/rail drift guard: same module set', () => {
  for (const kind of CONSOLE_ENTITIES) {
    it(`resolves the SAME editor-module set + order the rail shows for a ${kind}`, () => {
      // The console renders resolveEntityConsole; the rail renders appsForScope(scope, viewer, 'editor').
      const consoleIds = idsOf(resolveEntityConsole({ kind, id: 'x' }, SELECTION_VIEWER))
      const railIds = idsOf(appsForScope({ kind, id: 'x' }, SELECTION_VIEWER, 'editor'))
      expect(consoleIds).toEqual(railIds)
      // And both equal the rail's catalog set for the scope (modulesForScopeKind(kind, 'sidebar')).
      expect(consoleIds).toEqual(modulesForScopeKind(kind, 'sidebar').map((m) => m.id))
    })
  }

  it('shows MORE than the retired ENTITY_SURFACES Basics + Danger (the whole point of the unification)', () => {
    // The legacy registry surfaced only 2 rows per entity; the unified console shows the full rail set.
    const circle = idsOf(resolveEntityConsole({ kind: 'circle', id: 'x' }, SELECTION_VIEWER))
    expect(circle).toContain('circle.settings')
    expect(circle).toContain('circle.people')
    expect(circle).toContain('circle.placeAndTime')
    expect(circle.length).toBeGreaterThan(2)

    // Hub + nexus now surface their real Danger (archive) modules, not the old header-only Danger row.
    expect(idsOf(resolveEntityConsole({ kind: 'hub', id: 'x' }, SELECTION_VIEWER))).toContain('hub.danger')
    expect(idsOf(resolveEntityConsole({ kind: 'nexus', id: 'x' }, SELECTION_VIEWER))).toContain('nexus.danger')
  })

  it('gates on the viewer capabilities: a viewer with no caps sees no console modules', () => {
    for (const kind of CONSOLE_ENTITIES) {
      expect(resolveEntityConsole({ kind, id: 'x' }, { caps: new Set() })).toEqual([])
    }
  })

  it('fail-closed: a null scope or null viewer yields []', () => {
    expect(resolveEntityConsole(null, SELECTION_VIEWER)).toEqual([])
    expect(resolveEntityConsole({ kind: 'circle', id: 'x' }, null as never)).toEqual([])
  })
})
