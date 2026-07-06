import { describe, it, expect } from 'vitest'
import { APPS, appById } from './catalog'
import { toAdminModule, toLayoutMeta, toElementDef } from './adapters'
import { ADMIN_MODULES } from '@/lib/admin/modules/registry'
import { LAYOUT_MODULES } from '@/lib/widgets/modules'
import { REGISTRY_NAMES, TEMPLATE_PILLARS } from '@/lib/library/element-catalog'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { groupIntoTiers, tierForApp } from '@/lib/admin/modules/spine'

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

  it('editor Apps are exactly ADMIN_MODULES + the Space module lane (no extra editor Apps)', () => {
    // The editor lane is ADMIN_MODULES (capability-gated) PLUS the Space MODULE lane (spaceType-scoped,
    // spaceFunction/none-gated). A Space module is NOT an AdminModule (it lives outside the Capability
    // spine), so it adds its own editor App keyed by the module id. Modular menu P3b (ADR-546b): the lane
    // now derives from the P0 module manifest (SPACE_MODULES) instead of the legacy SPACE_SURFACES.
    const editorIds = APPS.filter((a) => a.surfaces.editor).map((a) => a.id).sort()
    const want = [...ADMIN_MODULES.map((m) => m.id), ...SPACE_MODULES.map((m) => m.id)].sort()
    expect(editorIds).toEqual(want)
  })
})

describe('Space editor lane ← SPACE_MODULES (modular menu P3b, ADR-546b)', () => {
  const spaceEditorApps = APPS.filter(
    (a) => a.surfaces.editor && a.scopes.some((s) => s.on === 'spaceType'),
  )

  it('one editor App per Space module, keyed by the module id', () => {
    expect(spaceEditorApps.map((a) => a.id).sort()).toEqual(SPACE_MODULES.map((m) => m.id).sort())
  })

  it('bridges each module onto the App gate: a feature module → spaceFunction, a shell module → none', () => {
    for (const m of SPACE_MODULES) {
      const app = spaceEditorApps.find((a) => a.id === m.id)!
      if (m.gate.kind === 'feature') {
        expect(app.gate).toEqual({ system: 'spaceFunction', fn: m.gate.fn })
      } else {
        expect(app.gate).toEqual({ system: 'none' })
      }
      // Placement is by Space TYPE — every module applies to every type ('*'); the per-type shaping is the
      // function gate (canUseSpaceFn), never a scopeKind.
      expect(app.scopes).toEqual([{ on: 'spaceType', type: '*' }])
    }
  })

  it('maps each module `render` onto the editor App: inline → inline, panel/link → link', () => {
    for (const m of SPACE_MODULES) {
      const app = spaceEditorApps.find((a) => a.id === m.id)!
      expect(app.surfaces.editor?.render, m.id).toBe(m.render === 'inline' ? 'inline' : 'link')
    }
  })

  it('classifies the shell config modules INLINE and every service / link module as a LINK', () => {
    // The owner directive (ADR-514): the standardized rail renders config inline ("everything in view")
    // and links out for every feature workflow. Identity / Info / Settings / Page mount inline editors;
    // every other module (the services, QR, Email, Insights, Billing, the Module Manager, Danger) links out
    // (a `panel` module renders a link-row whose body opens on-page via `?panel=`).
    const INLINE = ['space.branding', 'space.basics', 'space.settings', 'space.layout']
    for (const id of INLINE) {
      expect(APPS.find((a) => a.id === id)?.surfaces.editor?.render, id).toBe('inline')
    }
    for (const app of spaceEditorApps) {
      if (INLINE.includes(app.id)) continue
      expect(app.surfaces.editor?.render, app.id).toBe('link')
    }
  })
})

// The three-tier rail axis (ADR-514 three-tier reorg) flows through the catalog exactly like `render`:
// each editor App carries its source registry's `tier` + `priority` onto `surfaces.editor`, and the
// fail-safe defaults (untagged → primary; untagged danger → extra) live in the pure `tierForApp` seam.
describe('three-tier rail axis flows through the catalog', () => {
  it('carries each AdminModule tier/priority onto its editor App', () => {
    for (const m of ADMIN_MODULES) {
      const app = APPS.find((a) => a.id === m.id && a.surfaces.editor)!
      expect(app.surfaces.editor?.tier, m.id).toBe(m.tier)
      expect(app.surfaces.editor?.priority, m.id).toBe(m.priority)
    }
  })

  it('carries each Space module tier/priority onto its editor App', () => {
    for (const m of SPACE_MODULES) {
      const app = APPS.find((a) => a.id === m.id && a.surfaces.editor)!
      expect(app.surfaces.editor?.tier, m.id).toBe(m.tier)
      expect(app.surfaces.editor?.priority, m.id).toBe(m.priority)
    }
  })

  it('every INLINE editor App is tagged with a band + priority (no untagged rail-body surface shipped)', () => {
    // The band + priority order the rail BODY. A `placement: 'bank'` surface (ADR-515 Phase 2) leaves the
    // banded body for the bottom bank, so it carries no tier/priority — the invariant is over inline apps.
    for (const a of APPS.filter((x) => x.surfaces.editor && x.surfaces.editor.placement !== 'bank')) {
      expect(a.surfaces.editor?.tier, a.id).toBeTruthy()
      expect(typeof a.surfaces.editor?.priority, a.id).toBe('number')
    }
  })

  it('applies the fail-safe defaults on an UNTAGGED surface (untagged → primary; untagged danger → extra)', () => {
    // The pure resolver the settings panel uses: an untagged surface defaults to primary, but an
    // untagged danger surface is forced to extra so a destructive surface never renders expanded at top.
    expect(tierForApp({ category: 'people' })).toBe('primary')
    expect(tierForApp({ category: 'danger' })).toBe('extra')
  })

  // DANGER REACHABILITY (risk hold): a destructive surface must stay reachable — it lands in the EXTRA
  // band (under "More") AND stays in the catalog the search index is built from.
  it('keeps the Danger module in the extra group AND in the search index (catalog)', () => {
    const danger = SPACE_MODULES.find((m) => m.id === 'space.danger')!
    // In the catalog (the search index source) as an editor App.
    const app = APPS.find((a) => a.id === 'space.danger' && a.surfaces.editor)
    expect(app).toBeTruthy()
    // And it groups into the extra band, never standard/primary.
    const groups = groupIntoTiers([{ id: danger.id, category: danger.slot, tier: danger.tier, priority: danger.priority }])
    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe('extra')
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
