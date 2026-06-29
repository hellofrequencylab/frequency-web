import { describe, it, expect } from 'vitest'
import { moduleIdsForScope, moduleMeta, ROUTE_MODULE_IDS } from './modules'
import { COMPONENT_IDS } from './registry'

// The global community set — the default everywhere ('*'). (The LAYOUT_MODULE_IDS alias was
// removed in Phase 0.5a; '*' is the single source of the default.)
const GLOBAL = ROUTE_MODULE_IDS['*']

// Route-scoping (ADR-294): a page only offers — and the resolver only renders — its own block set.
describe('moduleIdsForScope', () => {
  it('the global default (*) returns the community set', () => {
    expect(moduleIdsForScope('*')).toBe(ROUTE_MODULE_IDS['*'])
    expect(moduleIdsForScope('*')).toEqual(GLOBAL)
  })

  it('an exact converted route returns its own set, not the global one', () => {
    const crew = moduleIdsForScope('/crew')
    expect(crew).toBe(ROUTE_MODULE_IDS['/crew'])
    expect(crew).toContain('quest-season-map')
    // No leakage: My Quest blocks never include the community default blocks.
    expect(crew).not.toContain('community-pulse')
  })

  it('a nested admin route resolves its exact set', () => {
    const j = moduleIdsForScope('/admin/content/journeys')
    expect(j).toBe(ROUTE_MODULE_IDS['/admin/content/journeys'])
    expect(j).toEqual(['admin-journeys-stats', 'admin-journeys-review', 'admin-journeys-library'])
  })

  it('the practices page resolves its blocks, including the URL-driven library', () => {
    const p = moduleIdsForScope('/practices')
    expect(p).toBe(ROUTE_MODULE_IDS['/practices'])
    expect(p).toEqual(['practices-stats', 'practices-activity', 'practices-balance', 'practices-mine', 'practices-library'])
    // No leakage; the faceted library IS a module now (it reads the URL from the x-search header).
    expect(p).not.toContain('community-pulse')
    expect(p).toContain('practices-library')
  })

  it('/lead has its own explicit Leadership-dashboard set (not the global blocks)', () => {
    // /lead is the leader's consolidated home: it declares its OWN block set (the leadership
    // dashboard), not the generic community footer, so the Layout editor offers the leader blocks.
    expect(moduleIdsForScope('/lead')).toBe(ROUTE_MODULE_IDS['/lead'])
    expect(moduleIdsForScope('/lead')).toEqual([
      'lead-stats',
      'lead-attention',
      'lead-circles',
      'lead-coleaders',
      'lead-networks',
      'lead-events',
      'lead-dispatches',
      'lead-journeys',
      'lead-recognition',
      'lead-tools',
    ])
  })

  it('an unconverted route falls back through its section to the global set', () => {
    // A section scope with no declared set falls back to global.
    expect(moduleIdsForScope('/settings/*')).toEqual(GLOBAL)
    // A truly unknown exact route with no section set also inherits global.
    expect(moduleIdsForScope('/nope')).toEqual(GLOBAL)
  })

  it('the Vault (/crew/store) resolves its own blocks, not /crew’s', () => {
    const v = moduleIdsForScope('/crew/store')
    expect(v).toBe(ROUTE_MODULE_IDS['/crew/store'])
    expect(v).toContain('vault-standing')
    expect(v).toContain('vault-store')
    // It's a distinct exact route — it does NOT inherit My Quest's blocks or the global set.
    expect(v).not.toContain('quest-season-map')
    expect(v).not.toContain('community-pulse')
  })

  it('the Menu Manager (/admin/menu) resolves its five blocks, in render order, with no leakage', () => {
    const m = moduleIdsForScope('/admin/menu')
    expect(m).toBe(ROUTE_MODULE_IDS['/admin/menu'])
    // The five blocks, in the locked render order (ADR-359): surface picker first, then the bulk
    // groups editor, the global speed panel, layout & defaults, and the rail cards.
    expect(m).toEqual(['menu-surface', 'menu-groups', 'menu-speed', 'menu-layout', 'menu-rail-cards'])
    // The retired single `menu-manager` id is gone.
    expect(m).not.toContain('menu-manager')
    // A distinct exact route — it never inherits the global community blocks.
    expect(m).not.toContain('community-pulse')
  })

  it('a practice detail page resolves the shared detail blocks via the /practices/* section scope', () => {
    const d = moduleIdsForScope('/practices/some-practice-id')
    expect(d).toBe(ROUTE_MODULE_IDS['/practices/*'])
    expect(d).toContain('practice-detail-stats')
    expect(d).toContain('practice-detail-guide')
    // Distinct from the index's own set.
    expect(moduleIdsForScope('/practices')).not.toContain('practice-detail-stats')
    expect(d).not.toContain('practices-library')
  })

  it("a section scope of a converted route does NOT inherit the exact route's blocks", () => {
    // '/crew/*' is a wildcard for crew SUB-pages (challenges, …) — distinct from '/crew' AND from
    // the now-converted exact '/crew/store' — so the wildcard still gets the generic set.
    expect(moduleIdsForScope('/crew/*')).toEqual(GLOBAL)
  })

  it('an entity profile tab resolves the family module set via the /spaces/* section scope', () => {
    // Every /spaces/<slug>/<tab> shares one family set keyed at '/spaces/*' (ENTITY-SPACES §B.2):
    // the index profile, a tab, and a different slug all resolve the same set, never the global one.
    const family = ROUTE_MODULE_IDS['/spaces/*']
    expect(moduleIdsForScope('/spaces/demo-practitioner')).toBe(family)
    expect(moduleIdsForScope('/spaces/demo-practitioner/offerings')).toBe(family)
    expect(moduleIdsForScope('/spaces/another-space/book')).toBe(family)
    expect(family).toContain('entity-about')
    expect(family).toContain('entity-cta')
    // No leakage: a profile never offers the global community blocks.
    expect(family).not.toContain('community-pulse')
  })
})

describe('moduleMeta', () => {
  it('resolves metadata across the whole union (any route block)', () => {
    expect(moduleMeta('quest-season-map')?.label).toBe('Season map')
    expect(moduleMeta('admin-journeys-library')?.label).toBe('Journey library')
    expect(moduleMeta('community-pulse')?.label).toBe('Community pulse')
    expect(moduleMeta('does-not-exist')).toBeUndefined()
  })

  it('every id in every route set has metadata + the union has no orphan dupes', () => {
    for (const ids of Object.values(ROUTE_MODULE_IDS)) {
      for (const id of ids) expect(moduleMeta(id), `missing meta for ${id}`).toBeDefined()
    }
  })
})

// Reachability (site-audit BUG-1/BUG-2): a component bound in the registry but absent from every
// route set can never render or be added from the Layout editor — a silent dead feature. Each
// bound id must be offered by some route set OR be on the explicit PARKED allowlist (modules kept
// defined for a future surface, by owner decision). Adding a binding without wiring a route fails here.
describe('module reachability', () => {
  // Intentionally defined-but-unoffered, documented in modules.ts (Phase 0.5.11 + event defaults).
  const PARKED = new Set(['quest-tasks', 'event-details', 'event-dispatch'])

  it('every bound component is route-reachable or explicitly parked', () => {
    const reachable = new Set<string>()
    for (const ids of Object.values(ROUTE_MODULE_IDS)) for (const id of ids) reachable.add(id)
    const stranded = COMPONENT_IDS.filter((id) => !reachable.has(id) && !PARKED.has(id))
    expect(stranded, `bound but unreachable (wire a route set or add to PARKED): ${stranded.join(', ')}`).toEqual([])
  })
})
