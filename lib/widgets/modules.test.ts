import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { moduleIdsForScope, moduleMeta, ROUTE_MODULE_IDS } from './modules'
import { COMPONENT_IDS } from './registry'
import { MODULE_ROUTES } from './module-routes'
import { PARKED, findViolations, readTree, floorFailures } from '../../scripts/check-module-reachability.mjs'

// The twelve modules RETIRED by LIVE-067 (2026-08-24): four under the global '*' key, whose
// fallback no route ever reached, and eight under '/spaces/*', which no page mounts. entity-cta is
// deliberately NOT here — it is the one member of that family a page renders, by direct import.
const RETIRED = [
  'community-pulse',
  'newest-members',
  'popular-channels',
  'top-circles',
  'entity-getting-started',
  'entity-about',
  'entity-stats',
  'entity-offerings',
  'entity-practices',
  'entity-community',
  'entity-team',
] as const

// Route-scoping (ADR-294): a page only offers — and the resolver only renders — its own block set.
describe('moduleIdsForScope', () => {
  it('there is NO global default set: * declares nothing and resolves to nothing', () => {
    // LIVE-067. '*' was the one key whose set no page could render — the chain puts it last and
    // every converted route declares its own, so the fallback only ever applied to routes that
    // render no modules at all. Both halves matter: deleting the KEY while `moduleIdsForScope`
    // still ended in `?? COMMUNITY_MODULE_IDS` would have resurrected the retired set through the
    // hardcoded fallback, which is the exact trap this pair pins shut.
    expect(ROUTE_MODULE_IDS['*']).toBeUndefined()
    expect(moduleIdsForScope('*')).toEqual([])
  })

  it('an exact converted route returns its own set, not the global one', () => {
    const crew = moduleIdsForScope('/crew')
    expect(crew).toBe(ROUTE_MODULE_IDS['/crew'])
    expect(crew).toContain('quest-season-map')
    // No leakage: My Quest's set is its own — never the Leadership hub's.
    expect(crew).not.toContain('lead-stats')
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
    // A distinct exact route — it never inherits the journeys workspace's set.
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
    // No leakage: the MEMBER library is a module here; the ADMIN curation table never is.
    expect(p).not.toContain('admin-practices-library')
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
      'lead-spaces',
      'lead-journeys',
      'lead-practices',
      'lead-events',
      'lead-networks',
      'lead-coleaders',
      'lead-dispatches',
      'lead-recognition',
      'lead-tools',
    ])
  })

  it('an unconverted route resolves NOTHING — it does not inherit a global set', () => {
    // A section scope with no declared set, and a truly unknown exact route, both fall off the end
    // of the chain. Empty is the honest answer: the page renders no modules, so the Layout editor
    // has no toggles to offer for it.
    expect(moduleIdsForScope('/settings/*')).toEqual([])
    expect(moduleIdsForScope('/nope')).toEqual([])
  })

  it('the Vault (/crew/store) resolves its own blocks, not /crew’s', () => {
    const v = moduleIdsForScope('/crew/store')
    expect(v).toBe(ROUTE_MODULE_IDS['/crew/store'])
    expect(v).toContain('vault-standing')
    expect(v).toContain('vault-store')
    // It's a distinct exact route — it does NOT inherit My Quest's blocks.
    expect(v).not.toContain('quest-season-map')
  })

  it('the Menu Manager (/admin/menu) resolves its five blocks, in render order, with no leakage', () => {
    const m = moduleIdsForScope('/admin/menu')
    expect(m).toBe(ROUTE_MODULE_IDS['/admin/menu'])
    // The five blocks, in the locked render order (ADR-359): surface picker first, then the bulk
    // groups editor, the global speed panel, layout & defaults, and the rail cards.
    expect(m).toEqual(['menu-surface', 'menu-groups', 'menu-speed', 'menu-layout', 'menu-rail-cards'])
    // The retired single `menu-manager` id is gone.
    expect(m).not.toContain('menu-manager')
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
    expect(moduleIdsForScope('/crew/*')).toEqual([])
  })

  it('the Operations dashboard (/admin/operations) resolves its blocks, in order, no leakage', () => {
    const o = moduleIdsForScope('/admin/operations')
    expect(o).toBe(ROUTE_MODULE_IDS['/admin/operations'])
    // Default render order: the AI & assistant KPIs, the platform stats, the Manage grid, then Related.
    expect(o).toEqual(['operations-ai', 'operations-platform', 'operations-manage', 'operations-related'])
  })

  it('the Growth dashboard (/admin/growth) resolves its blocks, in order, no leakage', () => {
    const g = moduleIdsForScope('/admin/growth')
    expect(g).toBe(ROUTE_MODULE_IDS['/admin/growth'])
    // Default render order: funnel & activation, pipeline, expansion, the Manage grid, then Related.
    expect(g).toEqual(['growth-funnel', 'growth-pipeline', 'growth-expansion', 'growth-manage', 'growth-related'])
  })

  it('the master-detail CRM home (/admin/crm) is NOT a module route — it composes its kit directly', () => {
    // The Resonance home was rebuilt as a master-detail surface (roster + compact stat row) that
    // composes the kit directly, so it declares no module set; its former cockpit blocks were re-homed
    // to /admin/crm/intelligence. moduleIdsForScope falls through to the global default (never the old
    // cockpit set), and it is absent from MODULE_ROUTES so the on-page Layout editor never appears.
    expect(ROUTE_MODULE_IDS['/admin/crm']).toBeUndefined()
    expect(MODULE_ROUTES).not.toContain('/admin/crm')
    const c = moduleIdsForScope('/admin/crm')
    expect(c).toEqual([]) // LIVE-067: it falls off the end of the chain rather than onto a global set
    expect(c).not.toContain('crm-cockpit-stats')
    expect(c).not.toContain('crm-rising')
    expect(c).not.toContain('crm-trust')
  })

  it('the three merged CRM routes are gone, and their blocks live on Intelligence', () => {
    // /admin/crm/today, /graph and /playbooks became `redirect('/admin/crm/intelligence')` and
    // nothing else. Keeping their sets gave the App catalog route scopes that navigate away, and
    // keeping their MODULE_ROUTES rows advertised a Layout editor on a page that never draws.
    for (const dead of ['/admin/crm/today', '/admin/crm/graph', '/admin/crm/playbooks']) {
      expect(ROUTE_MODULE_IDS[dead], `${dead} redirects; it must not declare a module set`).toBeUndefined()
      expect(MODULE_ROUTES).not.toContain(dead)
    }
    const intel = ROUTE_MODULE_IDS['/admin/crm/intelligence'] ?? []
    for (const id of ['crm-today', 'crm-graph-metrics', 'crm-graph-connections', 'crm-playbooks-stats', 'crm-playbooks-registry', 'crm-playbooks-runs']) {
      expect(intel, `${id} lost its home when its former route retired`).toContain(id)
    }
  })

  it('the CRM members page (/admin/crm/members) resolves its one roster block via the exact route, distinct from the cockpit', () => {
    const m = moduleIdsForScope('/admin/crm/members')
    expect(m).toBe(ROUTE_MODULE_IDS['/admin/crm/members'])
    expect(m).toEqual(['crm-members-roster'])
    // The nested exact route wins over the /admin/crm cockpit set: the cockpit's own crm-members
    // block never leaks here (nor this roster into the cockpit), and never the global default.
    expect(m).not.toContain('crm-members')
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
  })

  it('an entity profile tab offers NO module set — the profile renders lib/entity-blocks', () => {
    // LIVE-067. '/spaces/*' declared an eight-block family palette for a surface that never mounted
    // <PageModules>: the tabs under app/(main)/spaces/[slug]/(profile)/ compose lib/entity-blocks
    // directly. The set's only effect was to fill the Layout editor with blocks the page does not
    // contain. Registering it again is only honest beside a real mount (Epic 1.7), which
    // check:module-reachability now requires.
    expect(ROUTE_MODULE_IDS['/spaces/*']).toBeUndefined()
    expect(moduleIdsForScope('/spaces/demo-practitioner')).toEqual([])
    expect(moduleIdsForScope('/spaces/demo-practitioner/offerings')).toEqual([])
    expect(moduleIdsForScope('/spaces/another-space/book')).toEqual([])
  })

  it('🔴 the twelve retired modules are gone from every registry, not merely unlisted', () => {
    // The regression this closes is CHEAP to reintroduce: one line in a route set, or one revived
    // `?? COMMUNITY_MODULE_IDS`, brings a block back into the Layout editor that no page draws.
    // So assert all three registries at once — the route sets, the metadata union, and the
    // component bindings — rather than trusting any one of them.
    for (const [key, ids] of Object.entries(ROUTE_MODULE_IDS)) {
      for (const id of RETIRED) {
        expect(ids, `ROUTE_MODULE_IDS['${key}'] offers retired module ${id}`).not.toContain(id)
      }
    }
    for (const id of RETIRED) {
      expect(moduleMeta(id), `${id} still carries metadata`).toBeUndefined()
      expect(COMPONENT_IDS, `${id} still has a bound component`).not.toContain(id)
    }
  })

  it('entity-cta SURVIVED the retirement: still bound, still described, offered by no route', () => {
    // The positive control. A guard that only proves things are gone would pass just as happily
    // after deleting the whole family, including the one block a page really renders.
    expect(COMPONENT_IDS).toContain('entity-cta')
    expect(moduleMeta('entity-cta')?.label).toBe('Book')
    expect(Object.values(ROUTE_MODULE_IDS).some((ids) => ids.includes('entity-cta'))).toBe(false)
  })
})

// MODULE_ROUTES ⇄ ROUTE_MODULE_IDS (ADR-270/294): a route only offers the on-page Layout editor when
// it is in MODULE_ROUTES, and it only has blocks to arrange when it has a set in ROUTE_MODULE_IDS. The
// LP7 admin routes must be wired in both, so the editor matches the page's real content.
describe('module route registration (LP7 admin dashboards)', () => {
  // /admin/crm/today was here; it is now a bare redirect into /admin/crm/intelligence, so it has
  // neither a MODULE_ROUTES row nor a module set. See the retirement test above.
  const LP7_ROUTES = ['/admin/operations', '/admin/growth', '/admin/crm/members'] as const

  it('each converted route is registered in MODULE_ROUTES and declares its own module set', () => {
    for (const route of LP7_ROUTES) {
      expect(MODULE_ROUTES, `missing MODULE_ROUTES entry for ${route}`).toContain(route)
      expect(ROUTE_MODULE_IDS[route], `missing ROUTE_MODULE_IDS set for ${route}`).toBeDefined()
      expect((ROUTE_MODULE_IDS[route] ?? []).length).toBeGreaterThan(0)
    }
  })

  // The truth check that would have caught the three redirect stubs, and the one that keeps the
  // next merge from leaving one behind. MODULE_ROUTES is what makes isModuleRoute() true, which is
  // what draws the on-page Layout editor — so an entry whose page renders no <PageModules> offers
  // an operator a panel of blocks the page does not contain. Reading the file is the only way to
  // know: the list is strings, and nothing about a string says whether its page still exists.
  it('every MODULE_ROUTES entry resolves to a page that actually renders <PageModules>', () => {
    const root = join(__dirname, '..', '..')
    const GROUPS = ['(main)', '(marketing)', '(help)', '']
    for (const route of MODULE_ROUTES) {
      const file = GROUPS.map((g) => join(root, 'app', g, route.replace(/^\//, ''), 'page.tsx')).find((p) =>
        existsSync(p),
      )
      expect(file, `${route} is in MODULE_ROUTES but has no page.tsx`).toBeDefined()
      const src = readFileSync(file!, 'utf8')
      expect(
        src.includes('<PageModules'),
        `${route} is in MODULE_ROUTES but its page never renders <PageModules>` +
          (/redirect\(/.test(src) ? ' — it is a redirect stub, so the Layout editor draws on a page that navigates away' : ''),
      ).toBe(true)
    }
  })
})

describe('moduleMeta', () => {
  it('resolves metadata across the whole union (any route block)', () => {
    expect(moduleMeta('quest-season-map')?.label).toBe('Season map')
    expect(moduleMeta('admin-journeys-library')?.label).toBe('Journey library')
    expect(moduleMeta('entity-cta')?.label).toBe('Book')
    expect(moduleMeta('does-not-exist')).toBeUndefined()
  })

  it('every id in every route set has metadata + the union has no orphan dupes', () => {
    for (const ids of Object.values(ROUTE_MODULE_IDS)) {
      for (const id of ids) expect(moduleMeta(id), `missing meta for ${id}`).toBeDefined()
    }
  })
})

// ── Reachability: does a page actually RENDER this block? ────────────────────────────────────────
//
// 🔴 THIS TEST USED TO PASS ON TWELVE DEAD MODULES, and how it did is the lesson. It read:
//
//     for (const ids of Object.values(ROUTE_MODULE_IDS)) for (const id of ids) reachable.add(id)
//
// — so a module counted as reachable because it appeared in a route set, when whether that route
// set reaches a page was the entire question. '*' and '/spaces/*' are keys no page mounts, and all
// twelve of their ids sailed through for months (LIVE-067). A probe that restates its own premise
// measures nothing; it just reads like coverage.
//
// The real question is one level down: does some page under app/ MOUNT this route key, or import
// this block by name? That takes reading the app tree, which is what
// scripts/check-module-reachability.mjs does. This suite drives the same guard the CLI and CI run,
// so there is one definition of "reachable" and it is the one that looks at pages.
describe('module reachability', () => {
  const tree = readTree(join(__dirname, '..', '..'))

  it('read the tree it is about to judge (the non-triviality control)', () => {
    // Without this, a broken walk or a parser that stopped matching would make every assertion
    // below iterate zero times and report success — "I never looked" wearing "I looked and it was
    // fine" as a costume, which is the failure mode this whole file now exists to prevent.
    expect(floorFailures(tree)).toEqual([])
  })

  it('every bound component is mounted by a page, imported by one, or explicitly parked', () => {
    const violations = findViolations(tree)
    const report = violations
      .map((v) => (v.kind === 'unmounted-key' ? `${v.key}: ${v.ids.join(', ')}` : `stranded: ${v.ids.join(', ')}`))
      .join(' | ')
    expect(violations, `unreachable blocks — ${report}`).toEqual([])
  })

  it('the PARKED allowlist has one home, and it is not a copy of the live sets', () => {
    // The allowlist lives in the guard so the CLI, CI and this suite cannot disagree about which
    // blocks are deliberately unrenderable. Parking is an OWNER decision; each entry carries its
    // reason there. A parked id must still be a real binding — an entry for a deleted module is a
    // stale exemption that would silently cover a future block of the same name.
    expect(PARKED.size).toBeGreaterThan(0)
    for (const [id, reason] of PARKED) {
      expect(COMPONENT_IDS, `PARKED names ${id}, which is bound to nothing`).toContain(id)
      expect(reason.length, `PARKED['${id}'] needs a reason`).toBeGreaterThan(10)
    }
  })

  it('the guard would FAIL if a retired module were re-registered under an unmounted key', () => {
    // The mutation control. Re-register the community set at '*' — exactly the state of the tree
    // before LIVE-067 — and the guard must name all four. If this passes green, the guard has gone
    // vacuous and the assertion above is worthless.
    const mutant = {
      ...tree,
      routeSets: new Map([...tree.routeSets, ['*', ['community-pulse', 'newest-members', 'popular-channels', 'top-circles']]]),
      bindings: new Map([...tree.bindings, ['community-pulse', '@/components/widgets/community-pulse']]),
    }
    const dead = findViolations(mutant).find((v) => v.kind === 'unmounted-key' && v.key === '*')
    expect(dead?.ids).toContain('community-pulse')
  })
})
