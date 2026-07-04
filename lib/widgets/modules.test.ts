import { describe, it, expect } from 'vitest'
import { moduleIdsForScope, moduleMeta, ROUTE_MODULE_IDS } from './modules'
import { COMPONENT_IDS } from './registry'
import { MODULE_ROUTES } from './module-routes'

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

  it('the admin practices workspace resolves its curation blocks, in order, no leakage', () => {
    const p = moduleIdsForScope('/admin/content/practices')
    expect(p).toBe(ROUTE_MODULE_IDS['/admin/content/practices'])
    // Default render order: stats, review queue, merge duplicates, needs attention, faceted
    // library, tags, then the Phase 3 "Grow" blocks appended AFTER the original set.
    expect(p).toEqual([
      'admin-practices-stats',
      'admin-practices-review',
      'admin-practices-merge',
      'admin-practices-attention',
      'admin-practices-library',
      'admin-practices-tags',
      'admin-practices-remix-levers',
      'admin-practices-contributor-recognition',
    ])
    // The merge worklist sits between the review queue and the quality panel (decide, then dedupe).
    expect(p.indexOf('admin-practices-merge')).toBeGreaterThan(p.indexOf('admin-practices-review'))
    expect(p.indexOf('admin-practices-merge')).toBeLessThan(p.indexOf('admin-practices-attention'))
    // The faceted library IS a module here too (reads the URL from the x-search header).
    expect(p).toContain('admin-practices-library')
    // The two Phase 3 blocks come AFTER tags (the locked append order).
    expect(p.indexOf('admin-practices-remix-levers')).toBeGreaterThan(p.indexOf('admin-practices-tags'))
    expect(p.indexOf('admin-practices-contributor-recognition')).toBeGreaterThan(
      p.indexOf('admin-practices-remix-levers'),
    )
    // A distinct exact route — it never inherits the global community blocks or the journeys set.
    expect(p).not.toContain('community-pulse')
    expect(p).not.toContain('admin-journeys-library')
  })

  it('the Phase 3 remix blocks are scoped to the admin practices workspace only (no leak)', () => {
    // The member practice index, the member detail page, the journeys workspace, and the global
    // default must never offer the admin remix levers or contributor recognition.
    for (const scope of ['/practices', '/practices/some-id', '/admin/content/journeys', '*']) {
      expect(moduleIdsForScope(scope)).not.toContain('admin-practices-remix-levers')
      expect(moduleIdsForScope(scope)).not.toContain('admin-practices-contributor-recognition')
    }
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
    // Phase 3 "Grow" (ADR-438): the member remix-lineage surface joins the /practices/* detail set.
    expect(d).toContain('practice-detail-lineage')
    // Distinct from the index's own set; the lineage block never leaks onto the index either.
    expect(moduleIdsForScope('/practices')).not.toContain('practice-detail-stats')
    expect(moduleIdsForScope('/practices')).not.toContain('practice-detail-lineage')
    expect(d).not.toContain('practices-library')
  })

  it("a section scope of a converted route does NOT inherit the exact route's blocks", () => {
    // '/crew/*' is a wildcard for crew SUB-pages (challenges, …) — distinct from '/crew' AND from
    // the now-converted exact '/crew/store' — so the wildcard still gets the generic set.
    expect(moduleIdsForScope('/crew/*')).toEqual(GLOBAL)
  })

  it('the Operations dashboard (/admin/operations) resolves its blocks, in order, no leakage', () => {
    const o = moduleIdsForScope('/admin/operations')
    expect(o).toBe(ROUTE_MODULE_IDS['/admin/operations'])
    // Default render order: the AI & assistant KPIs, the platform stats, the Manage grid, then Related.
    expect(o).toEqual(['operations-ai', 'operations-platform', 'operations-manage', 'operations-related'])
    // A distinct exact route — it never inherits the global community blocks.
    expect(o).not.toContain('community-pulse')
  })

  it('the Growth dashboard (/admin/growth) resolves its blocks, in order, no leakage', () => {
    const g = moduleIdsForScope('/admin/growth')
    expect(g).toBe(ROUTE_MODULE_IDS['/admin/growth'])
    // Default render order: funnel & activation, pipeline, expansion, the Manage grid, then Related.
    expect(g).toEqual(['growth-funnel', 'growth-pipeline', 'growth-expansion', 'growth-manage', 'growth-related'])
    expect(g).not.toContain('community-pulse')
  })

  it('the Resonance CRM cockpit (/admin/crm) resolves its blocks, in order, distinct from Today', () => {
    const c = moduleIdsForScope('/admin/crm')
    expect(c).toBe(ROUTE_MODULE_IDS['/admin/crm'])
    // VIEWER-FIRST (ADR-459): the member block leads, then the health cockpit, rising pool, backtest.
    expect(c).toEqual(['crm-members', 'crm-cockpit-stats', 'crm-rising', 'crm-trust'])
    // The index and Vera Today are DISTINCT exact routes — neither leaks into the other.
    expect(c).not.toContain('crm-today')
    expect(c).not.toContain('community-pulse')
  })

  it('the Vera Today page (/admin/crm/today) resolves its one block via the exact route, not the CRM index set', () => {
    const t = moduleIdsForScope('/admin/crm/today')
    expect(t).toBe(ROUTE_MODULE_IDS['/admin/crm/today'])
    expect(t).toEqual(['crm-today'])
    // The nested exact route wins over the /admin/crm cockpit set (and never the global default).
    expect(t).not.toContain('crm-members')
    expect(t).not.toContain('community-pulse')
  })

  it('the CRM members page (/admin/crm/members) resolves its one roster block via the exact route, distinct from the cockpit', () => {
    const m = moduleIdsForScope('/admin/crm/members')
    expect(m).toBe(ROUTE_MODULE_IDS['/admin/crm/members'])
    expect(m).toEqual(['crm-members-roster'])
    // The nested exact route wins over the /admin/crm cockpit set: the cockpit's own crm-members
    // block never leaks here (nor this roster into the cockpit), and never the global default.
    expect(m).not.toContain('crm-members')
    expect(m).not.toContain('community-pulse')
    expect(moduleIdsForScope('/admin/crm')).not.toContain('crm-members-roster')
  })

  it('the Gamification page (/admin/gamification) resolves its seven blocks, in order, no leakage', () => {
    const g = moduleIdsForScope('/admin/gamification')
    expect(g).toBe(ROUTE_MODULE_IDS['/admin/gamification'])
    // Default render order: season control, the janitor-only reward editor, the Rewards v2 metrics,
    // the stat band, the top-achievers leaderboard, then the achievements + season-challenges tables.
    expect(g).toEqual([
      'gamification-season',
      'gamification-rewards',
      'gamification-metrics',
      'gamification-stats',
      'gamification-top-achievers',
      'gamification-achievements',
      'gamification-challenges',
    ])
    // A distinct exact route — it never inherits the global community blocks.
    expect(g).not.toContain('community-pulse')
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

// MODULE_ROUTES ⇄ ROUTE_MODULE_IDS (ADR-270/294): a route only offers the on-page Layout editor when
// it is in MODULE_ROUTES, and it only has blocks to arrange when it has a set in ROUTE_MODULE_IDS. The
// LP7 admin routes must be wired in both, so the editor matches the page's real content.
describe('module route registration (LP7 admin dashboards)', () => {
  const LP7_ROUTES = [
    '/admin/operations',
    '/admin/growth',
    '/admin/crm',
    '/admin/crm/today',
    '/admin/crm/members',
  ] as const

  it('each converted route is registered in MODULE_ROUTES and declares its own module set', () => {
    for (const route of LP7_ROUTES) {
      expect(MODULE_ROUTES, `missing MODULE_ROUTES entry for ${route}`).toContain(route)
      expect(ROUTE_MODULE_IDS[route], `missing ROUTE_MODULE_IDS set for ${route}`).toBeDefined()
      expect((ROUTE_MODULE_IDS[route] ?? []).length).toBeGreaterThan(0)
    }
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
