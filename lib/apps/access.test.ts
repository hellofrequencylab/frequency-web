import { describe, it, expect } from 'vitest'
import { appGatePasses, surfacesFor } from './access'
import { APPS } from './catalog'
import { toAdminModule } from './adapters'
import { modulesFor } from '@/lib/admin/modules/registry'
import type { Scope, Capability } from '@/lib/core/capabilities'
import type { AppViewer } from './types'

// LP1 gate-parity + fail-closed behavior (docs/LOOM-PLATFORM.md §7). appGatePasses + surfacesFor
// reproduce modulesFor(scope, caps) exactly on the editor set, and deny on every malformed input.

const viewer = (caps: Capability[]): AppViewer => ({ caps: new Set(caps) })

/** surfacesFor(editor) mapped back through the adapter must equal modulesFor exactly. */
function assertParity(scope: Scope, caps: Capability[]) {
  const got = surfacesFor(APPS, { on: 'scopeKind', kind: scope.kind }, viewer(caps), 'editor').map(
    toAdminModule,
  )
  expect(got).toEqual(modulesFor(scope, new Set(caps)))
}

describe('gate parity — surfacesFor(editor) reproduces modulesFor', () => {
  it('circle manager sees both circle editor modules, in order', () => {
    const scope: Scope = { kind: 'circle', circleId: 'c1', hostId: null }
    assertParity(scope, ['circle.editSettings'])
    // Order guarantee: circle.settings (order 10) precedes circle.text (order 15).
    const ids = surfacesFor(APPS, { on: 'scopeKind', kind: 'circle' }, viewer(['circle.editSettings']), 'editor').map(
      (a) => a.id,
    )
    expect(ids).toEqual(['circle.settings', 'circle.text'])
  })

  it('circle non-manager sees no editor modules', () => {
    const scope: Scope = { kind: 'circle', circleId: 'c1', hostId: null }
    assertParity(scope, [])
    expect(surfacesFor(APPS, { on: 'scopeKind', kind: 'circle' }, viewer([]), 'editor')).toEqual([])
  })

  it('event, hub, nexus, practice, channel each match modulesFor on their gate', () => {
    assertParity({ kind: 'event', eventId: 'e1', hostId: null }, ['event.editSettings'])
    assertParity({ kind: 'hub', hubId: 'h1' }, ['hub.manage'])
    assertParity({ kind: 'nexus', nexusId: 'n1' }, ['nexus.manage'])
    assertParity({ kind: 'practice', practiceId: 'p1', ownerId: null }, ['practice.editSettings'])
    assertParity({ kind: 'channel', channelId: 'ch1' }, ['channel.manage'])
  })

  it('a wrong-scope capability grants nothing (event cap on a hub scope)', () => {
    assertParity({ kind: 'hub', hubId: 'h1' }, ['event.editSettings'])
  })

  it('global scope offers no editor modules', () => {
    assertParity({ kind: 'global' }, ['admin.access'])
  })
})

describe('appGatePasses', () => {
  it('none is always open; capability checks the set', () => {
    expect(appGatePasses({ system: 'none' }, viewer([]))).toBe(true)
    expect(appGatePasses({ system: 'capability', capability: 'circle.editSettings' }, viewer(['circle.editSettings']))).toBe(true)
    expect(appGatePasses({ system: 'capability', capability: 'circle.editSettings' }, viewer([]))).toBe(false)
  })

  it('spaceFunction fails closed without a predicate; passes when it grants', () => {
    expect(appGatePasses({ system: 'spaceFunction', fn: 'crm' }, viewer([]))).toBe(false)
    expect(
      appGatePasses({ system: 'spaceFunction', fn: 'crm' }, { caps: new Set(), canUseSpaceFn: (fn) => fn === 'crm' }),
    ).toBe(true)
    expect(
      appGatePasses({ system: 'spaceFunction', fn: 'email' }, { caps: new Set(), canUseSpaceFn: (fn) => fn === 'crm' }),
    ).toBe(false)
  })

  it('staff fails closed unless isStaff === true', () => {
    expect(appGatePasses({ system: 'staff' }, viewer([]))).toBe(false)
    expect(appGatePasses({ system: 'staff' }, { caps: new Set(), isStaff: false })).toBe(false)
    expect(appGatePasses({ system: 'staff' }, { caps: new Set(), isStaff: true })).toBe(true)
  })

  it('an unknown gate system fails closed', () => {
    // Simulate a malformed/forward-compat gate reaching the resolver.
    expect(appGatePasses({ system: 'bogus' } as never, viewer([]))).toBe(false)
  })
})

describe('surfacesFor fail-closed', () => {
  it('a null/undefined viewer yields no surfaces', () => {
    expect(surfacesFor(APPS, { on: 'scopeKind', kind: 'circle' }, null as never, 'editor')).toEqual([])
    expect(surfacesFor(APPS, { on: 'scopeKind', kind: 'circle' }, undefined as never)).toEqual([])
  })

  it('kind narrows to a single surface; library elements match the library query', () => {
    const lib = surfacesFor(APPS, { on: 'library' }, viewer([]), 'element')
    expect(lib.length).toBeGreaterThan(0)
    expect(lib.every((a) => a.surfaces.element)).toBe(true)
    // Editor/page Apps never match a library query.
    expect(lib.some((a) => a.surfaces.editor || a.surfaces.page)).toBe(false)
  })

  it('a route query matches the page Apps offered at that exact key', () => {
    const crew = surfacesFor(APPS, { on: 'route', key: '/crew' }, viewer([]), 'page').map((a) => a.id)
    expect(crew).toContain('quest-season-map')
    expect(crew).not.toContain('community-pulse') // '*' only, not '/crew'
  })
})
