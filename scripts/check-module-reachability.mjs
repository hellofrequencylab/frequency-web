#!/usr/bin/env node
// check:module-reachability — a REGISTERED layout module must be one a page can actually render.
//
// 🔴 THE FAILURE THIS CLOSES (LIVE-067). `lib/widgets/modules.ts` carries two registries that IMPLY
// reachability: `LAYOUT_MODULES` (a block exists) and `ROUTE_MODULE_IDS` (a route offers it). Neither
// says a page RENDERS it. Twelve modules sat registered and unrenderable — four under the global '*'
// key, whose fallback never fired because every real route declares its own set, and eight under
// '/spaces/*', where the entity profile composes `lib/entity-blocks` and never mounts <PageModules>.
// They were dead for months, and they were dead LOUDLY: the Layout editor's "All pages" scope offered
// an operator toggles for blocks no page contains.
//
// ⚠️ THE OLD TEST PASSED ON ALL TWELVE, which is why this file exists rather than one more assertion
// in lib/widgets/modules.test.ts. That test counted a module "reachable" if it appeared in ANY route
// set — so a module was proven reachable by the very registration whose truth was in question. This
// is the repo's named shape-not-truth failure (ADR-970 and friends): a probe must measure the
// CONSEQUENCE, never restate its own premise.
//
// THE RULE. A route key is MOUNTED when some file under app/ renders `<PageModules route=…>` against
// it (a literal route, or a template literal whose dynamic segment is the section wildcard, e.g.
// route={`/circles/${slug}`} ⇒ '/circles/*'). Then:
//
//   A. Every id in an UNMOUNTED route key's set must have its bound component imported by some file
//      under app/. This is what makes '/admin/crm/intelligence' legal: that page composes its six
//      blocks DIRECTLY (it carries an extra staff gate the module engine can't express), so the
//      blocks render even though nothing mounts <PageModules> there. It is also what keeps
//      `entity-cta` legal after the LIVE-067 retirement: /spaces/<slug>/book imports it by name.
//   B. Every id with a bound component in lib/widgets/registry.tsx must be offered by a MOUNTED
//      route key, or imported directly under app/, or named in PARKED below. A binding that is none
//      of those is a component nothing can ever draw.
//
// Both arms read only the source tree, so this guard's home is vitest (ADR-1011) — see
// scripts/check-module-reachability.test.ts, which drives every arm against fixtures that must FAIL,
// cross-checks the parsers against the real TypeScript modules, and asserts the tree as committed
// exits 0. The `pnpm check:module-reachability` CLI prints the same report locally.
//
// Usage: `node scripts/check-module-reachability.mjs` (or `pnpm check:module-reachability`).

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()

/** Modules deliberately defined-but-unoffered, by owner decision. Each stays BOUND so it compiles and
 *  a future surface can adopt it; none is renderable today, and that is the intended state. Moved here
 *  from lib/widgets/modules.test.ts so the allowlist has ONE home that both the guard and the test read.
 *  Every entry needs a reason a reviewer can see, and the list should shrink. */
export const PARKED = new Map([
  ['quest-tasks', 'retired from My Quest by owner ask; kept for a future surface'],
  ['event-details', 'the poster key-value box; superseded by the Event Details card'],
  ['event-dispatch', 'host compose box; folded into the activity block'],
  ['event-venue-map', 'second venue map; event-location is the canonical venue block'],
  ['event-gallery', 'duplicate photo strip; the hero gallery renders in the page'],
  ['event-pricing', 'poster pricing box; ticketing lives in the Join box'],
  ['event-sales', 'host sales box; the sold count is folded onto the ticket card'],
  ['crm-members', "the cockpit's inline roster; superseded by the master-detail roster"],
])

// ── source readers ───────────────────────────────────────────────────────────────────────────────

/** Comments stripped, quote-aware. A naive strip corrupts `'https://…'` and, more to the point here,
 *  a commented-out `<PageModules route="/x">` in prose would otherwise read as a live mount — several
 *  module pages describe their own mount in a header comment, so this is load-bearing, not tidiness. */
export function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    if (quote) {
      if (c === '\\') {
        out += c + (src[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

/** The balanced `open`…`close` block starting at the first `open` at or after `from`. */
function block(src, from, open, close) {
  const start = src.indexOf(open, from)
  if (start === -1) return ''
  let depth = 0
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === open) depth += 1
    else if (src[i] === close) {
      depth -= 1
      if (depth === 0) return src.slice(start + 1, i)
    }
  }
  return ''
}

const STRINGS = /'([^'\n]*)'|"([^"\n]*)"/g

function stringsIn(src) {
  return [...src.matchAll(STRINGS)].map((m) => m[1] ?? m[2])
}

/** scope key → the module ids it offers, parsed from lib/widgets/modules.ts. Handles both spellings:
 *  `'/lead': LEAD_MODULE_IDS` (the live one) and an inline `'/lead': ['a','b']`. */
export function parseRouteModuleIds(src) {
  const code = stripComments(src)
  const decl = code.indexOf('ROUTE_MODULE_IDS')
  if (decl === -1) return new Map()
  const body = block(code, decl, '{', '}')
  const out = new Map()
  const ENTRY = /(?:'([^'\n]+)'|"([^"\n]+)")\s*:\s*(\[|[A-Za-z_$][\w$]*)/g
  for (const m of body.matchAll(ENTRY)) {
    const key = m[1] ?? m[2]
    if (m[3] === '[') {
      out.set(key, stringsIn(block(body, m.index + m[0].length - 1, '[', ']')))
    } else {
      const at = code.search(new RegExp(`\\b(?:const|let|var)\\s+${m[3]}\\b`))
      out.set(key, at === -1 ? [] : stringsIn(block(code, at, '[', ']')))
    }
  }
  return out
}

/** module id → the import specifier of its bound component, parsed from lib/widgets/registry.tsx. */
export function parseComponentBindings(src) {
  const code = stripComments(src)
  const pathByLocal = new Map()
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const name of m[1].split(',')) {
      const local = name.trim().split(/\s+as\s+/).pop()?.trim()
      if (local) pathByLocal.set(local, m[2])
    }
  }
  const decl = code.indexOf('const COMPONENTS')
  const body = decl === -1 ? '' : block(code, decl, '{', '}')
  const out = new Map()
  for (const m of body.matchAll(/(?:'([^'\n]+)'|"([^"\n]+)")\s*:\s*([A-Za-z_$][\w$]*)/g)) {
    const id = m[1] ?? m[2]
    out.set(id, pathByLocal.get(m[3]) ?? null)
  }
  return out
}

/** Every `<PageModules route=…>` mount under app/, as the SCOPE KEY it resolves against: a literal
 *  route verbatim, and a template literal with its dynamic segment collapsed to the section wildcard
 *  ('/circles/${slug}' ⇒ '/circles/*'), which is the key moduleIdsForScope actually resolves for it. */
export function parseMountedKeys(sources) {
  const keys = new Set()
  for (const src of sources) {
    const code = stripComments(src)
    for (const m of code.matchAll(/<PageModules\b([\s\S]{0,400}?)\/?>/g)) {
      const attrs = m[1]
      const lit = attrs.match(/route\s*=\s*(?:['"]([^'"]+)['"]|\{\s*['"]([^'"]+)['"]\s*\})/)
      if (lit) {
        keys.add(lit[1] ?? lit[2])
        continue
      }
      const tpl = attrs.match(/route\s*=\s*\{\s*`([^`]+)`\s*\}/)
      if (tpl) keys.add(tpl[1].replace(/\$\{[^}]*\}/g, '*'))
    }
  }
  return keys
}

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p)
  }
  return out
}

// ── the check ────────────────────────────────────────────────────────────────────────────────────

/** Pure core, so the sibling test can drive every arm from fixtures.
 *  `input`: { routeSets: Map<key, ids[]>, bindings: Map<id, importPath|null>, mounted: Set<key>,
 *             appSources: string[] } */
export function findViolations(input) {
  const { routeSets, bindings, mounted, appSources } = input
  const appText = appSources.join('\n')
  const importedInApp = (id) => {
    const path = bindings.get(id)
    return path != null && (appText.includes(`'${path}'`) || appText.includes(`"${path}"`))
  }

  const violations = []

  // A. A route key nothing mounts offers ids that nothing renders — unless the page imports the
  //    component directly (the /admin/crm/intelligence shape).
  for (const [key, ids] of routeSets) {
    if (mounted.has(key)) continue
    const dead = ids.filter((id) => !importedInApp(id))
    if (dead.length) violations.push({ kind: 'unmounted-key', key, ids: dead })
  }

  // B. A bound component reachable from no MOUNTED route set and imported by no page can never draw.
  const liveIds = new Set()
  for (const [key, ids] of routeSets) if (mounted.has(key)) for (const id of ids) liveIds.add(id)
  const stranded = [...bindings.keys()].filter(
    (id) => !liveIds.has(id) && !importedInApp(id) && !PARKED.has(id),
  )
  if (stranded.length) violations.push({ kind: 'stranded-binding', ids: stranded })

  return violations
}

/** Read the real tree. Floors included: a broken walk or a parser that stopped matching would
 *  otherwise report "✓ nothing unreachable" having looked at nothing. */
export function readTree(root = ROOT) {
  const modules = readFileSync(join(root, 'lib/widgets/modules.ts'), 'utf8')
  const registry = readFileSync(join(root, 'lib/widgets/registry.tsx'), 'utf8')
  const appDir = join(root, 'app')
  const appFiles = existsSync(appDir) ? walk(appDir, ['.ts', '.tsx']) : []
  const appSources = appFiles.map((f) => readFileSync(f, 'utf8'))
  return {
    routeSets: parseRouteModuleIds(modules),
    bindings: parseComponentBindings(registry),
    mounted: parseMountedKeys(appSources),
    appSources,
    appFileCount: appFiles.length,
  }
}

/** The floors that separate "I looked and it was fine" from "I never looked". */
export const FLOORS = { routeKeys: 20, bindings: 50, mounted: 15, appFiles: 200 }

export function floorFailures(tree) {
  const bad = []
  if (tree.routeSets.size < FLOORS.routeKeys)
    bad.push(`parsed only ${tree.routeSets.size} ROUTE_MODULE_IDS keys (floor ${FLOORS.routeKeys})`)
  if (tree.bindings.size < FLOORS.bindings)
    bad.push(`parsed only ${tree.bindings.size} component bindings (floor ${FLOORS.bindings})`)
  if (tree.mounted.size < FLOORS.mounted)
    bad.push(`found only ${tree.mounted.size} <PageModules> mounts (floor ${FLOORS.mounted})`)
  if (tree.appFileCount < FLOORS.appFiles)
    bad.push(`walked only ${tree.appFileCount} files under app/ (floor ${FLOORS.appFiles})`)
  return bad
}

function main() {
  const tree = readTree()
  const floors = floorFailures(tree)
  if (floors.length) {
    console.error('✗ check:module-reachability could not read the tree it is supposed to measure:')
    for (const f of floors) console.error(`    - ${f}`)
    console.error('\n  A parser or a walk broke. This guard proves nothing until that is fixed.\n')
    process.exit(1)
  }

  const violations = findViolations(tree)
  if (violations.length === 0) {
    console.log(
      `✓ module reachability: ${tree.bindings.size} bound block(s) across ${tree.routeSets.size} route ` +
        `key(s); every registered module is mounted by a page or imported by one ` +
        `(${tree.mounted.size} <PageModules> mount(s), ${PARKED.size} parked).`,
    )
    return
  }

  console.error('✗ module reachability: registered blocks that no page can render.\n')
  for (const v of violations) {
    if (v.kind === 'unmounted-key') {
      console.error(
        `  ROUTE_MODULE_IDS['${v.key}'] — no page mounts <PageModules route="${v.key}">, and these ` +
          `ids' components are imported by no file under app/:`,
      )
    } else {
      console.error('  Bound in lib/widgets/registry.tsx but reachable from no mounted route and no page:')
    }
    for (const id of v.ids) console.error(`    - ${id}`)
    console.error('')
  }
  console.error(
    '  Fix it one of three ways: MOUNT the route (render <PageModules route="…"> on its page and\n' +
      '  register it in lib/widgets/module-routes.ts), IMPORT the block directly on the page that\n' +
      '  should draw it, or RETIRE it — delete the meta, the route-set entry, the registry binding\n' +
      '  and the component file. Parking a block instead needs an owner decision and a reason in\n' +
      '  PARKED (scripts/check-module-reachability.mjs).\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
