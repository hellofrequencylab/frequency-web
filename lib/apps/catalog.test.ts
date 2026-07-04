import { describe, it, expect } from 'vitest'
import { APPS, appById } from './catalog'
import { toAdminModule, toLayoutMeta, toElementDef } from './adapters'
import { ADMIN_MODULES } from '@/lib/admin/modules/registry'
import { LAYOUT_MODULES } from '@/lib/widgets/modules'
import { REGISTRY_NAMES, TEMPLATE_PILLARS } from '@/lib/library/element-catalog'
import { SPACE_SURFACES } from '@/lib/admin/entities/registry'

// LP1 superset conformance + adapter round-trip (docs/LOOM-PLATFORM.md §7): every existing registry id
// maps to EXACTLY ONE App and derives back byte-for-byte, so LP2 can flip the source of truth safely.

describe('App id integrity', () => {
  it('every App id is unique across all lanes', () => {
    const ids = APPS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('appById resolves and misses cleanly', () => {
    expect(appById('circle.settings')?.surfaces.editor).toBeDefined()
    expect(appById('community-pulse')?.surfaces.page).toBeDefined()
    expect(appById('element:icon/lotus')?.surfaces.element).toBeDefined()
    expect(appById('does-not-exist')).toBeUndefined()
  })
})

describe('editor superset ← ADMIN_MODULES', () => {
  it('every AdminModule has exactly one editor App that round-trips byte-for-byte', () => {
    for (const m of ADMIN_MODULES) {
      const matches = APPS.filter((a) => a.id === m.id && a.surfaces.editor)
      expect(matches, `expected one editor App for '${m.id}'`).toHaveLength(1)
      expect(toAdminModule(matches[0])).toEqual(m)
    }
  })

  it('editor Apps are exactly ADMIN_MODULES + the Space surface lane (no extra editor Apps)', () => {
    // The editor lane is ADMIN_MODULES (capability-gated) PLUS the Space surface lane (spaceType-scoped,
    // spaceFunction/none-gated — ENTITY-MANAGEMENT / PR C). A Space surface is NOT an AdminModule (it lives
    // outside the Capability spine), so it adds its own editor App keyed by id.
    const editorIds = APPS.filter((a) => a.surfaces.editor).map((a) => a.id).sort()
    const want = [...ADMIN_MODULES.map((m) => m.id), ...SPACE_SURFACES.map((s) => s.id)].sort()
    expect(editorIds).toEqual(want)
  })
})

describe('Space editor lane ← SPACE_SURFACES (ENTITY-MANAGEMENT / PR C)', () => {
  const spaceEditorApps = APPS.filter(
    (a) => a.surfaces.editor && a.scopes.some((s) => s.on === 'spaceType'),
  )

  it('one editor App per Space surface, keyed by the surface id', () => {
    expect(spaceEditorApps.map((a) => a.id).sort()).toEqual(SPACE_SURFACES.map((s) => s.id).sort())
  })

  it('bridges each surface onto the App gate: a functioned surface → spaceFunction, else none', () => {
    for (const s of SPACE_SURFACES) {
      const app = spaceEditorApps.find((a) => a.id === s.id)!
      if (s.requiredFunction) {
        expect(app.gate).toEqual({ system: 'spaceFunction', fn: s.requiredFunction })
      } else {
        expect(app.gate).toEqual({ system: 'none' })
      }
      // Placement is by Space TYPE (never a scopeKind) — this is the dormant {on:'spaceType'} plumbing.
      expect(app.scopes.every((sc) => sc.on === 'spaceType')).toBe(true)
    }
  })
})

describe('page superset ← LAYOUT_MODULES', () => {
  it('every LAYOUT_MODULE has exactly one page App that round-trips byte-for-byte', () => {
    for (const m of LAYOUT_MODULES) {
      const matches = APPS.filter((a) => a.id === m.id && a.surfaces.page)
      expect(matches, `expected one page App for '${m.id}'`).toHaveLength(1)
      expect(toLayoutMeta(matches[0])).toEqual(m)
    }
  })

  it('page Apps map 1:1 with LAYOUT_MODULES', () => {
    const pageIds = APPS.filter((a) => a.surfaces.page).map((a) => a.id).sort()
    expect(pageIds).toEqual(LAYOUT_MODULES.map((m) => m.id).sort())
  })

  it("a page App's route scopes are exactly the ROUTE_MODULE_IDS keys that offer it", () => {
    // community-pulse is offered only by the global '*' set; quest-season-map only by '/crew'.
    expect(appById('community-pulse')?.scopes).toEqual([{ on: 'route', key: '*' }])
    expect(appById('quest-season-map')?.scopes).toEqual([{ on: 'route', key: '/crew' }])
    // A parked module (offered by no route set today) has an empty scope list, by design.
    expect(appById('quest-tasks')?.scopes).toEqual([])
  })
})

describe('element superset ← the element catalog (drift-guarded)', () => {
  const elementApps = APPS.filter((a) => a.surfaces.element)

  it('the {registry, name} set exactly matches the exported REGISTRY_NAMES (drift guard)', () => {
    const byRegistry = new Map<string, Set<string>>()
    for (const a of elementApps) {
      const { registry, name } = a.surfaces.element!
      const set = byRegistry.get(registry) ?? new Set<string>()
      set.add(name)
      byRegistry.set(registry, set)
    }
    // Same registries, same names — a rename/add/remove in the source catalog fails here.
    expect([...byRegistry.keys()].sort()).toEqual(Object.keys(REGISTRY_NAMES).sort())
    for (const [registry, names] of Object.entries(REGISTRY_NAMES)) {
      expect(byRegistry.get(registry)).toEqual(names)
    }
  })

  it('circle-template pillars match the exported TEMPLATE_PILLARS', () => {
    for (const a of elementApps) {
      const el = a.surfaces.element!
      if (el.registry === 'circle-template') {
        expect(el.pillar).toBe(TEMPLATE_PILLARS[el.name])
      }
    }
  })

  it('every element App id is element:<registry>/<name> and round-trips its config', () => {
    for (const a of elementApps) {
      const def = toElementDef(a)
      expect(a.id).toBe(`element:${def.registry}/${def.name}`)
      // The render config {registry, name} is the byte-for-byte round-trip §7 locks.
      expect({ registry: def.registry, name: def.name }).toEqual({
        registry: a.surfaces.element!.registry,
        name: a.surfaces.element!.name,
      })
      // Display metadata is carried so toElementDef yields a complete ElementDef for LP2.
      expect(def.title).toBe(a.label)
      expect(def.category).toBeTruthy()
      expect(def.tags.length).toBeGreaterThan(0)
    }
  })

  it('no illustration-registry element Apps (illustrations are not element-catalog entries)', () => {
    expect(elementApps.some((a) => a.surfaces.element!.registry === 'illustration')).toBe(false)
  })
})
