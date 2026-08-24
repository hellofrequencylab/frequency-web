import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PARKED,
  FLOORS,
  stripComments,
  parseRouteModuleIds,
  parseComponentBindings,
  parseMountedKeys,
  findViolations,
  floorFailures,
  readTree,
} from './check-module-reachability.mjs'
import { ROUTE_MODULE_IDS } from '@/lib/widgets/modules'
import { COMPONENT_IDS } from '@/lib/widgets/registry'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ENFORCING HALF of check:module-reachability (backlog LIVE-067).
//
// The guard answers one question the two module registries cannot answer about themselves: does a
// PAGE render this block? Twelve modules were registered and unrenderable for months, and the test
// that was supposed to catch that passed on all twelve because it defined "reachable" as "appears
// in a route set" — restating the premise instead of measuring the consequence.
//
// So this file is deliberately adversarial about its own guard:
//   • every arm is driven by a fixture that must FAIL, including a RECONSTRUCTION of the tree as it
//     stood before the retirement, which must name all eleven dead ids;
//   • both source parsers are cross-checked against the real TypeScript modules, because a parser
//     that silently stops matching turns this whole guard green;
//   • the floors are exercised, because a broken walk is the other way to pass by looking at nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..')

/** A minimal tree in the shape `findViolations` consumes. */
function tree(over: Partial<Parameters<typeof findViolations>[0]> = {}) {
  return {
    routeSets: new Map([['/crew', ['quest-today']]]),
    bindings: new Map([['quest-today', '@/components/widgets/quest/quest-today']]),
    mounted: new Set(['/crew']),
    appSources: ['<PageModules route="/crew" />'],
    ...over,
  } as Parameters<typeof findViolations>[0]
}

describe('the unmounted-key arm', () => {
  it('FAILS a route set whose key no page mounts and whose blocks no page imports', () => {
    const v = findViolations(
      tree({
        routeSets: new Map([['/spaces/*', ['entity-about']]]),
        bindings: new Map([['entity-about', '@/components/widgets/entity/entity-about']]),
        mounted: new Set(),
        appSources: ['export default function Profile() { return null }'],
      }),
    )
    expect(v).toContainEqual({ kind: 'unmounted-key', key: '/spaces/*', ids: ['entity-about'] })
  })

  it('PASSES when the page imports the block directly — the /admin/crm/intelligence shape', () => {
    // The positive control the guard exists to preserve. That page composes its six blocks by hand
    // (it carries an extra staff gate the module engine cannot express), so its key is registered
    // and unmounted and yet nothing there is dead. A guard that flagged it would be routed around
    // within a week, which is the ADR-970 failure.
    expect(
      findViolations(
        tree({
          routeSets: new Map([['/admin/crm/intelligence', ['crm-graph-metrics']]]),
          bindings: new Map([['crm-graph-metrics', '@/components/widgets/crm/crm-graph-metrics']]),
          mounted: new Set(),
          appSources: ["import { CrmGraphMetrics } from '@/components/widgets/crm/crm-graph-metrics'"],
        }),
      ),
    ).toEqual([])
  })

  it('does not accept a PREFIX match for the import — entity-cta-link is not entity-cta', () => {
    // The two files sit beside each other and one name contains the other. Matching on a bare
    // substring would let a surviving sibling vouch for a deleted block.
    const v = findViolations(
      tree({
        routeSets: new Map([['/spaces/*', ['entity-cta']]]),
        bindings: new Map([['entity-cta', '@/components/widgets/entity/entity-cta']]),
        mounted: new Set(),
        appSources: ["import { EntityCtaLink } from '@/components/widgets/entity/entity-cta-link'"],
      }),
    )
    expect(v).toContainEqual({ kind: 'unmounted-key', key: '/spaces/*', ids: ['entity-cta'] })
  })
})

describe('the stranded-binding arm', () => {
  it('FAILS a bound component reachable from no mounted route and no page', () => {
    const v = findViolations(
      tree({
        routeSets: new Map([['/crew', ['quest-today']]]),
        bindings: new Map([
          ['quest-today', '@/components/widgets/quest/quest-today'],
          ['ghost-block', '@/components/widgets/ghost-block'],
        ]),
      }),
    )
    expect(v).toContainEqual({ kind: 'stranded-binding', ids: ['ghost-block'] })
  })

  it('🔴 does NOT count a route set the tree never mounts as reachability', () => {
    // This is the exact bug in the test this guard replaces. The old rule was "appears in any route
    // set"; here the id appears in a route set AND the key is unmounted, so the honest verdict is
    // unreachable. If this ever goes green the guard has regressed to restating its premise.
    const v = findViolations(
      tree({
        routeSets: new Map([['*', ['community-pulse']]]),
        bindings: new Map([['community-pulse', '@/components/widgets/community-pulse']]),
        mounted: new Set(),
        appSources: ['export default function Page() { return null }'],
      }),
    )
    expect(v.some((x) => x.kind === 'stranded-binding' && x.ids.includes('community-pulse'))).toBe(true)
  })

  it('exempts a PARKED id, and only a PARKED id', () => {
    const parked = [...PARKED.keys()][0]
    const bindings = new Map([
      [parked, '@/components/widgets/parked-thing'],
      ['not-parked', '@/components/widgets/not-parked'],
    ])
    const v = findViolations(tree({ routeSets: new Map(), bindings, mounted: new Set(), appSources: [''] }))
    expect(v).toEqual([{ kind: 'stranded-binding', ids: ['not-parked'] }])
  })
})

describe('the pre-retirement tree, reconstructed', () => {
  // The mutation control with teeth: rebuild the twelve registrations exactly as they stood on
  // 2026-08-24 and require the guard to name the eleven dead ones — and to clear entity-cta, which
  // the Book tab really does render. A guard that fails both, or clears both, is not measuring.
  const DEAD = [
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
  ]
  const before = tree({
    routeSets: new Map([
      ['*', ['community-pulse', 'newest-members', 'popular-channels', 'top-circles']],
      ['/spaces/*', [...DEAD.slice(4), 'entity-cta']],
    ]),
    bindings: new Map([
      ...DEAD.map((id) => [id, `@/components/widgets/${id}`] as [string, string]),
      ['entity-cta', '@/components/widgets/entity/entity-cta'],
    ]),
    mounted: new Set(),
    appSources: ["import { EntityCta } from '@/components/widgets/entity/entity-cta'"],
  })

  it('names all eleven retired ids', () => {
    const named = new Set(findViolations(before).flatMap((v) => v.ids))
    for (const id of DEAD) expect(named, `${id} should have been caught`).toContain(id)
  })

  it('clears entity-cta, because a page imports it', () => {
    expect(findViolations(before).flatMap((v) => v.ids)).not.toContain('entity-cta')
  })
})

describe('the source parsers, cross-checked against the real modules', () => {
  // A regex parser over TypeScript is exactly the component that goes quietly wrong, and when it
  // does this guard reports "✓ nothing unreachable" forever. So compare it to the truth: the same
  // registries, imported.
  it('parseRouteModuleIds reproduces ROUTE_MODULE_IDS exactly, keys and ids', () => {
    const parsed = parseRouteModuleIds(readFileSync(join(ROOT, 'lib/widgets/modules.ts'), 'utf8'))
    expect([...parsed.keys()].sort()).toEqual(Object.keys(ROUTE_MODULE_IDS).sort())
    for (const [key, ids] of Object.entries(ROUTE_MODULE_IDS)) {
      expect(parsed.get(key), `route set for ${key}`).toEqual([...ids])
    }
  })

  it('parseComponentBindings reproduces COMPONENT_IDS, and resolves every import path', () => {
    const parsed = parseComponentBindings(readFileSync(join(ROOT, 'lib/widgets/registry.tsx'), 'utf8'))
    expect([...parsed.keys()].sort()).toEqual([...COMPONENT_IDS].sort())
    for (const [id, path] of parsed) expect(path, `${id} has no resolved import path`).toBeTruthy()
  })

  it('parseMountedKeys reads literal, template-literal and multi-attribute mounts', () => {
    const keys = parseMountedKeys([
      '<PageModules route="/lead" role={role} />',
      '<PageModules route={`/circles/${circle.slug}`} moduleIds={FEED} />',
      '<PageModules\n  route="/pages"\n/>',
    ])
    expect([...keys].sort()).toEqual(['/circles/*', '/lead', '/pages'])
  })

  it('🔴 a mount described in a COMMENT is not a mount', () => {
    // Several module pages open with a header comment quoting their own <PageModules route="…">.
    // Counting those would make the guard vouch for a mount that a refactor had already removed —
    // the prose outliving the code, which is the failure this repo names most often.
    expect(parseMountedKeys(['// the interior is laid out by <PageModules route="/pages">'])).toEqual(new Set())
    expect(parseMountedKeys(['/* <PageModules route="/lead" /> */'])).toEqual(new Set())
  })

  it('stripComments leaves string bodies alone', () => {
    expect(stripComments("const u = 'https://example.com/a' // trailing")).toBe("const u = 'https://example.com/a' ")
  })
})

describe('the floors', () => {
  it('fire on a tree the readers could not read', () => {
    const empty = { routeSets: new Map(), bindings: new Map(), mounted: new Set(), appSources: [], appFileCount: 0 }
    expect(floorFailures(empty)).toHaveLength(4)
  })

  it('are set below the live readings, not at them', () => {
    // A floor pinned to today's exact count is a chore, not a control; one an order of magnitude
    // below the reading catches the case it is for (a walk that returned nothing).
    const live = readTree(ROOT)
    expect(live.routeSets.size).toBeGreaterThan(FLOORS.routeKeys)
    expect(live.bindings.size).toBeGreaterThan(FLOORS.bindings)
    expect(live.mounted.size).toBeGreaterThan(FLOORS.mounted)
    expect(live.appFileCount).toBeGreaterThan(FLOORS.appFiles)
  })
})

describe('the tree as committed', () => {
  it('has no unreachable layout module', () => {
    const live = readTree(ROOT)
    expect(floorFailures(live)).toEqual([])
    const violations = findViolations(live)
    const report = violations
      .map((v) => (v.kind === 'unmounted-key' ? `${v.key}: ${v.ids.join(', ')}` : `stranded: ${v.ids.join(', ')}`))
      .join(' | ')
    expect(violations, report).toEqual([])
  })

  it('every PARKED id is still a real binding', () => {
    // A stale exemption is worse than none: it would silently cover a future block that reused the
    // name. Parking is an owner decision, so each entry also carries its reason in the guard.
    for (const [id, reason] of PARKED) {
      expect(COMPONENT_IDS, `PARKED names ${id}, which is bound to nothing`).toContain(id)
      expect(reason.length).toBeGreaterThan(10)
    }
  })
})
