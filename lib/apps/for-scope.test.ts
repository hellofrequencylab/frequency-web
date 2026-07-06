import { describe, it, expect } from 'vitest'
import { Circle } from 'lucide-react'
import { appsForScope, showsAdminBar, lockedAppsForScope, isAttainableGate } from './for-scope'
import { APPS } from './catalog'
import { modulesForScopeKind, type ScopeKind } from '@/lib/admin/modules/registry'
import { spaceModuleManifest } from '@/lib/admin/modules/space-modules'
import type { SpaceType } from '@/lib/spaces/types'
import type { App, AppViewer } from './types'

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

const ENTITY_KINDS: ScopeKind[] = ['circle', 'hub', 'nexus', 'event', 'practice', 'channel', 'journey', 'profile']

describe('appsForScope — editor apps preserve modulesForScopeKind behavior (LP4 B1)', () => {
  it('resolves the SAME editor-module id set AND order as modulesForScopeKind(kind, "sidebar")', () => {
    for (const kind of ENTITY_KINDS) {
      const got = appsForScope({ kind }, SELECTION_VIEWER, 'editor').map((a) => a.id)
      const want = modulesForScopeKind(kind, 'sidebar').map((m) => m.id)
      expect(got, kind).toEqual(want)
    }
  })

  it('offers the personal "You" apps as editor modules on the operator global scope (Phase 4)', () => {
    // The personal apps (ADMIN-RAIL.md Phase 4) are the ONLY global-scope editor modules — they apply
    // to every signed-in viewer's own account and make the bar always available. A capable viewer sees
    // them; a no-caps viewer sees none (they gate on account.manage).
    // The full personal set (ADR-515 Phase 2), ordered — the inline body (Profile, Spotlight, Layout) then
    // the bank surfaces (Appearance, Notifications, Connections, Account and privacy, Billing). It must
    // equal the registry's global-scope sidebar set (the catalog derives from ADMIN_MODULES).
    expect(appsForScope({ kind: 'global' }, SELECTION_VIEWER, 'editor').map((a) => a.id)).toEqual(
      modulesForScopeKind('global', 'sidebar').map((m) => m.id),
    )
    expect(appsForScope({ kind: 'global' }, { caps: new Set() }, 'editor')).toEqual([])
  })

  it('fail-closed: a null scope or null viewer yields []', () => {
    expect(appsForScope(null, SELECTION_VIEWER, 'editor')).toEqual([])
    expect(appsForScope({ kind: 'circle' }, null as never, 'editor')).toEqual([])
  })
})

describe('appsForScope — Space editor apps render from the module manifest (modular menu P3b, ADR-546b)', () => {
  // A Space profile resolves its editor apps by spaceType + the viewer's per-Space functions, so
  // appsForScope({ kind:'space', spaceType }, viewerHoldingEveryFn, 'editor') resolves the SAME independent
  // module set the /manage console renders via spaceModuleManifest — P3b retargets the rail lane onto the P0
  // manifest. With every function usable the two align exactly, id AND order (every module gates purely on
  // its own function, so the rail and the console resolve the identical set for a given viewer).
  const everyFn: AppViewer = { caps: new Set(), canUseSpaceFn: () => true }
  const OFFERING_TYPES: SpaceType[] = ['practitioner', 'business', 'organization', 'event_space']

  it('matches the module manifest id set for each offering-bearing type', () => {
    for (const type of OFFERING_TYPES) {
      const got = appsForScope({ kind: 'space', id: 'x', spaceType: type }, everyFn, 'editor').map((a) => a.id)
      const want = spaceModuleManifest({}).map((m) => m.id)
      expect(new Set(got), type).toEqual(new Set(want))
    }
  })

  it('gates on the viewer functions: a no-function viewer keeps only the always-on floor', () => {
    // With no functions the functioned modules (members, crm, the six functioned commerce modules, qr,
    // email, billing) drop; the always-on (gate 'none') floor — Identity / Info / Settings / Page / Store /
    // the Module Manager / Danger — stays, so the owner NEVER sees an empty rail (the fail-safe).
    const noFn: AppViewer = { caps: new Set(), canUseSpaceFn: () => false }
    const got = appsForScope({ kind: 'space', id: 'x', spaceType: 'practitioner' }, noFn, 'editor').map((a) => a.id)
    expect(got).toContain('space.basics')
    expect(got).toContain('space.danger')
    expect(got).toContain('space.modules') // the Module Manager (always-on shell) stays
    expect(got).not.toContain('space.people') // members function absent
  })

  it('honors the Module Manager overrides on the scope: HIDDEN drops, ORDER reorders (P3b)', () => {
    // Hiding a module removes it from the rail set (like the console); reordering within a band permutes the
    // rail while every other module stays put. The hidden/order ride on scope.moduleMenu (the Customize
    // trigger passes the owner's saved spaces.preferences.moduleMenu).
    const hidden = appsForScope(
      { kind: 'space', id: 'x', spaceType: 'practitioner', moduleMenu: { hidden: ['space.booking'] } },
      everyFn,
      'editor',
    ).map((a) => a.id)
    expect(hidden).not.toContain('space.booking')
    expect(hidden).toContain('space.people')

    // Reorder CRM ahead of Members within the Audience band: CRM's within-band priority now sorts first.
    const apps = appsForScope(
      { kind: 'space', id: 'x', spaceType: 'practitioner', moduleMenu: { order: ['space.crm', 'space.people'] } },
      everyFn,
      'editor',
    )
    const crm = apps.find((a) => a.id === 'space.crm')!
    const people = apps.find((a) => a.id === 'space.people')!
    expect(crm.surfaces.editor!.priority!).toBeLessThan(people.surfaces.editor!.priority!)
  })

  it('an empty menu override is byte-for-byte the default manifest set (no reorder, no hiding)', () => {
    const withEmpty = appsForScope(
      { kind: 'space', id: 'x', spaceType: 'practitioner', moduleMenu: { order: [], hidden: [] } },
      everyFn,
      'editor',
    )
    const plain = appsForScope({ kind: 'space', id: 'x', spaceType: 'practitioner' }, everyFn, 'editor')
    expect(withEmpty).toEqual(plain)
  })

  it('fail-closed: an untyped Space scope (path-derived, no type) resolves nothing', () => {
    expect(appsForScope({ kind: 'space', id: 'x' }, everyFn, 'editor')).toEqual([])
  })

  it('a Space scope carries no layout-module page blocks', () => {
    expect(appsForScope({ kind: 'space', id: 'x', spaceType: 'practitioner' }, everyFn, 'page')).toEqual([])
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
    // The operator global scope offers page blocks (gate 'none') but they must NOT light the bar. A
    // viewer with no caps holds neither a page-block editor App (there are none) nor the personal gate,
    // so the bar stays dark — page blocks alone never light it.
    expect(showsAdminBar({ kind: 'global' }, { caps: new Set() })).toBe(false)
  })

  it('lights on the global scope for a viewer holding the personal gate (Phase 4 always-on)', () => {
    // The personal "You" apps ARE global-scope editor Apps (account.manage), so a capable viewer's bar
    // is always available. This is the intended Phase-4 flip: presence is guaranteed by the personal set.
    expect(showsAdminBar({ kind: 'global' }, SELECTION_VIEWER)).toBe(true)
  })

  it('still lights on an entity scope for a viewer that holds its manage gate', () => {
    // The behavior-preservation anchor: a caps-blind selection viewer resolves the circle manage
    // modules, so the bar shows on an entity scope exactly as before.
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, SELECTION_VIEWER)).toBe(true)
    // A viewer with no caps has no editor module on an entity scope → dark.
    expect(showsAdminBar({ kind: 'circle', id: 'c1' }, { caps: new Set() })).toBe(false)
  })
})

// Phase 5 (docs/ADMIN-RAIL.md, principle P3). Three states per App: never-eligible (hidden — filtered
// by appsForScope), eligible (shown), and ATTAINABLE-but-locked (shown as a lock + reason). "Attainable"
// is narrow: only a plan-gated `spaceFunction` (an `entitlement` the viewer could unlock). A plain
// capability the viewer merely lacks is NEVER attainable — it stays hidden (no silent greyed row).

const editorApp = (id: string, kind: ScopeKind, gate: App['gate']): App => ({
  id,
  label: `App ${id}`,
  category: 'basics',
  scopes: [{ on: 'scopeKind', kind }],
  gate,
  surfaces: { editor: { surface: 'sidebar', Icon: Circle, order: 0, render: 'inline' } },
  themeable: false,
  status: 'final',
  version: 1,
})

const planGate = (fn: string, entitlement?: string): App['gate'] =>
  ({ system: 'spaceFunction', fn, entitlement }) as App['gate']
const capGate = (): App['gate'] => ({ system: 'capability', capability: 'x' as never })

describe('isAttainableGate', () => {
  it('is true only for a plan-gated spaceFunction, never capability / staff / none', () => {
    expect(isAttainableGate(planGate('tickets', 'pro'))).toBe(true)
    expect(isAttainableGate(planGate('tickets'))).toBe(false) // a spaceFunction with NO entitlement
    expect(isAttainableGate(capGate())).toBe(false)
    expect(isAttainableGate({ system: 'staff' })).toBe(false)
    expect(isAttainableGate({ system: 'none' })).toBe(false)
  })
})

describe('lockedAppsForScope — attainable-but-locked apps (Phase 5 / P3)', () => {
  const catalog: App[] = [
    editorApp('locked.plan', 'circle', planGate('tickets', 'pro')), // attainable via a plan upgrade
    editorApp('hidden.cap', 'circle', capGate()), // never-eligible: a capability the viewer lacks
    editorApp('open.fn', 'circle', planGate('members', 'pro')), // eligible: its function passes
    editorApp('other.scope', 'event', planGate('tickets', 'pro')), // a different scope kind
  ]

  it('locks a plan-gated spaceFunction the viewer lacks, with a reason (no em dash)', () => {
    const viewer: AppViewer = { caps: new Set(), canUseSpaceFn: (fn) => fn === 'members' }
    const locked = lockedAppsForScope({ kind: 'circle', id: 'c1' }, viewer, catalog)
    expect(locked.map((l) => l.app.id)).toEqual(['locked.plan'])
    expect(locked[0].reason).toContain('pro')
    expect(locked[0].reason).not.toMatch(/—/)
  })

  it('NEVER locks a plain capability the viewer merely lacks (stays hidden, not shown)', () => {
    const viewer: AppViewer = { caps: new Set(), canUseSpaceFn: () => false }
    const ids = lockedAppsForScope({ kind: 'circle', id: 'c1' }, viewer, catalog).map((l) => l.app.id)
    expect(ids).not.toContain('hidden.cap')
  })

  it('does not lock an App whose gate already passes (eligible → a working editor)', () => {
    const viewer: AppViewer = { caps: new Set(), canUseSpaceFn: () => true }
    const ids = lockedAppsForScope({ kind: 'circle', id: 'c1' }, viewer, catalog).map((l) => l.app.id)
    expect(ids).not.toContain('open.fn')
  })

  it('matches the scope kind only; fail-closed on a null scope or viewer', () => {
    const viewer: AppViewer = { caps: new Set(), canUseSpaceFn: () => false }
    // Only 'other.scope' matches an event scope, and it IS attainable-locked there.
    expect(lockedAppsForScope({ kind: 'event' }, viewer, catalog).map((l) => l.app.id)).toEqual([
      'other.scope',
    ])
    expect(lockedAppsForScope(null, viewer, catalog)).toEqual([])
    expect(lockedAppsForScope({ kind: 'circle' }, null as never, catalog)).toEqual([])
  })

  it('the LIVE catalog has NO attainable-locked apps today (fail-safe: no appear-then-error)', () => {
    // No catalog App declares a plan-gated spaceFunction yet, so the render pattern produces [] until a
    // gate opts in — it can never crowd the bar or promise access the server would then deny.
    expect(lockedAppsForScope({ kind: 'circle', id: 'c1' }, { caps: new Set() })).toEqual([])
    expect(lockedAppsForScope({ kind: 'global' }, SELECTION_VIEWER)).toEqual([])
  })
})
