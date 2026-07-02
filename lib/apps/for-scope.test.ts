import { describe, it, expect } from 'vitest'
import { appsForScope, showsAdminBar } from './for-scope'
import { APPS } from './catalog'
import { modulesForScopeKind, type ScopeKind } from '@/lib/admin/modules/registry'
import type { AppViewer } from './types'

// LP4 (docs/LOOM-PLATFORM.md §5). appsForScope wraps surfacesFor over the App catalog: editor apps
// match the scope kind exactly and REPRODUCE modulesForScopeKind(kind, 'sidebar') byte-for-byte (the
// behavior-preservation guarantee that lets settings-panel go catalog-driven); page apps resolve a
// most-specific-wins route chain like moduleIdsForScope.

// A caps-BLIND selection viewer that passes every editor App's own gate — this is exactly how the
// settings panel resolves the manage-module list before real caps are threaded (self-gating modules
// stay the server-side authority), so the resolved set must equal the caps-independent registry set.
const SELECTION_VIEWER: AppViewer = {
  caps: new Set(
    APPS.flatMap((a) => (a.surfaces.editor && a.gate.system === 'capability' ? [a.gate.capability] : [])),
  ),
}

const ENTITY_KINDS: ScopeKind[] = ['circle', 'hub', 'nexus', 'event', 'practice', 'channel', 'profile']

describe('appsForScope — editor apps preserve modulesForScopeKind behavior (LP4 B1)', () => {
  it('resolves the SAME editor-module id set AND order as modulesForScopeKind(kind, "sidebar")', () => {
    for (const kind of ENTITY_KINDS) {
      const got = appsForScope({ kind }, SELECTION_VIEWER, 'editor').map((a) => a.id)
      const want = modulesForScopeKind(kind, 'sidebar').map((m) => m.id)
      expect(got, kind).toEqual(want)
    }
  })

  it('offers no editor modules on the operator global scope', () => {
    expect(appsForScope({ kind: 'global' }, SELECTION_VIEWER, 'editor')).toEqual([])
  })

  it('fail-closed: a null scope or null viewer yields []', () => {
    expect(appsForScope(null, SELECTION_VIEWER, 'editor')).toEqual([])
    expect(appsForScope({ kind: 'circle' }, null as never, 'editor')).toEqual([])
  })
})

describe('appsForScope — page apps resolve a most-specific-wins route chain', () => {
  const anyone: AppViewer = { caps: new Set() }

  it('a circle scope resolves the /circles/* section blocks, shadowing the global default', () => {
    const ids = appsForScope({ kind: 'circle', id: 'sunrise-sit' }, anyone, 'page').map((a) => a.id)
    expect(ids).toContain('circle-feed')
    expect(ids).not.toContain('community-pulse') // the '*' default is shadowed by the section set
  })

  it('an event scope resolves the /events/* section blocks', () => {
    const ids = appsForScope({ kind: 'event', id: 'sunrise-sit' }, anyone, 'page').map((a) => a.id)
    expect(ids).toContain('event-join')
  })

  it('the operator global scope resolves the community default (*) blocks', () => {
    const ids = appsForScope({ kind: 'global' }, anyone, 'page').map((a) => a.id)
    expect(ids).toContain('community-pulse')
  })
})

describe('showsAdminBar', () => {
  it('is true where a capable viewer has a manage module; false for a null viewer or scope', () => {
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, SELECTION_VIEWER)).toBe(true)
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, null as never)).toBe(false)
    expect(showsAdminBar(null, SELECTION_VIEWER)).toBe(false)
  })

  it('is editor-only: page blocks do NOT light the bar on the global scope (the flaw guard)', () => {
    // The operator global scope offers page blocks (gate 'none') but NO editor modules. Counting page
    // blocks would falsely light the bar for any signed-in viewer; editor-only keeps it dark here.
    expect(showsAdminBar({ kind: 'global' }, { caps: new Set() })).toBe(false)
    // Even a viewer holding every editor capability has no EDITOR App on the global scope.
    expect(showsAdminBar({ kind: 'global' }, SELECTION_VIEWER)).toBe(false)
  })

  it('still lights on an entity scope for a viewer that holds its manage gate', () => {
    // The behavior-preservation anchor: a caps-blind selection viewer resolves the circle manage
    // modules, so the bar shows on an entity scope exactly as before.
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, SELECTION_VIEWER)).toBe(true)
    // A viewer with no caps has no editor module on an entity scope → dark.
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, { caps: new Set() })).toBe(false)
  })
})
