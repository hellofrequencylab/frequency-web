#!/usr/bin/env node
// WHERE THE DAWN DEBT ACTUALLY IS, BY ROUTE — the measurement that chose the visual suite's
// operator surfaces (ADR-1128, backlog HYG-026).
//
// A MEASUREMENT TOOL, NOT A GATE. It exits 0 always and is wired into no workflow, on purpose:
// its job is to answer "which routes should the camera point at?" once, loudly enough that the
// answer can be re-derived rather than taken on trust. Re-run it before widening or trimming
// `OPERATOR_PATHS` in test/e2e/surfaces.ts.
//
//   node scripts/visual-surface-census.mjs            # the whole report
//   node scripts/visual-surface-census.mjs --chosen   # just: what do today's picks cover?
//
// ── WHAT IT COUNTS ────────────────────────────────────────────────────────────────────────
// Two numbers per file, both from the LIVE ratchet rather than a fresh grep, so this cannot
// drift from `scripts/adoption-baselines.json` (AGENTS.md: quote the frozen baselines):
//   · `raw-button-bg` — the frozen adoption class, counted through check-adoption.mjs's own
//     `countEntry` on its own corpus (comment- and string-aware, strip-comments@2).
//   · raw `<button` opening tags — PROG-DAWN3's own basis for the ~2,070 figure, of which the
//     row says ~90% is the button sweep.
//
// ── 🔴 THE ATTRIBUTION, AND THE TRAP IN IT ────────────────────────────────────────────────
// The obvious method is: follow a route's imports transitively and sum the debt you reach. It
// is wrong, and it is wrong in the flattering direction. Measured while writing this: a FULL
// transitive closure from `app/(main)/admin/gamification/page.tsx` reaches 71 debt-bearing
// files worth 52 raw-button-bg — and fourteen unrelated admin routes reach the SAME 71,
// because somewhere in the graph sits a registry that imports most of the product. Under that
// measure `/admin/moderation` "covers" components/events/event-activity.tsx, which it does not
// render and a camera pointed at it would never see. An import is not a render, and a coverage
// number built on imports is the shape-not-truth failure this repo names in four ADRs.
//
// So the basis here is DELIBERATELY SHALLOW and stated rather than assumed: a route owns the
// files in its own directory (minus nested directories that are their own routes), plus TWO
// import hops out of them. Two hops reaches "the page, its co-located client components, and
// the components those mount" and stops before the registries. It still over-counts — a
// component behind a tab or a dialog is reachable and unphotographed — so read every number
// below as an UPPER BOUND on what a screenshot of that route watches, never as a promise.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadConfig, loadCorpus, countEntry } from './check-adoption.mjs'

const ROOT = process.cwd()
const ADMIN_ROOT = path.join(ROOT, 'app', '(main)', 'admin')
const EXTS = ['.tsx', '.ts', '.mts']

/** The routes test/e2e/surfaces.ts watches TODAY, as their page files. Anything reachable from
 *  here is already under a camera, so it is not credit an added surface may claim. */
const WATCHED_TODAY = [
  'app/page.tsx',
  'app/(marketing)/about/page.tsx',
  'app/(marketing)/spaces/page.tsx',
  'app/(marketing)/the-lab/page.tsx',
  'app/(marketing)/the-community/page.tsx',
  'app/(marketing)/the-quest/page.tsx',
  'app/(marketing)/pricing/page.tsx',
  'app/discover/page.tsx',
  'app/(main)/feed/page.tsx',
  'app/(main)/settings/page.tsx',
  'app/(main)/nearby/page.tsx',
]

/** The operator routes surfaces.ts picked. Kept here so `--chosen` can re-check them. */
const CHOSEN = [
  '/admin',
  '/admin/library',
  '/admin/marketing/nurture',
  '/admin/crew-tasks',
  '/admin/crm',
  '/admin/content/practices',
  '/admin/qr',
]

function debtByFile() {
  const config = loadConfig()
  const corpus = loadCorpus(config)
  const entry = config.entries.find((e) => e.key === 'raw-button-bg')
  if (!entry) throw new Error('adoption-baselines.json has no raw-button-bg entry')
  const debt = new Map()
  for (const file of corpus) {
    const bg = countEntry(entry, [file]).count
    const all = (file.text.match(/<button\b/g) ?? []).length
    if (bg || all) debt.set(file.path, { bg, all })
  }
  return debt
}

function resolveImport(spec, from) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(path.join(ROOT, from)), spec)
  else return null
  for (const ext of EXTS) if (existsSync(base + ext)) return path.relative(ROOT, base + ext)
  for (const ext of EXTS) {
    const idx = path.join(base, `index${ext}`)
    if (existsSync(idx)) return path.relative(ROOT, idx)
  }
  return null
}

const importCache = new Map()
function importsOf(rel) {
  const cached = importCache.get(rel)
  if (cached) return cached
  let source = ''
  try {
    source = readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    // A path that resolved but cannot be read is not a reason to stop the census.
  }
  const out = []
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(m[1], rel)
    if (resolved) out.push(resolved)
  }
  importCache.set(rel, out)
  return out
}

/** Every file reachable from `seeds`, with no hop limit. Used ONLY for the "already watched"
 *  figure, where over-reach is the conservative direction: it can only shrink the credit an
 *  added surface claims, never inflate it. */
function reachAll(seeds) {
  const seen = new Set()
  const stack = [...seeds]
  while (stack.length > 0) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const dep of importsOf(cur)) if (!seen.has(dep)) stack.push(dep)
  }
  return seen
}

/** Reachable within `depth` hops. Bounded on purpose — see the header. */
function reach(seeds, depth) {
  const seen = new Set(seeds)
  let frontier = [...seeds]
  for (let d = 0; d < depth; d++) {
    const next = []
    for (const file of frontier) {
      for (const dep of importsOf(file)) {
        if (!seen.has(dep)) {
          seen.add(dep)
          next.push(dep)
        }
      }
    }
    frontier = next
  }
  return seen
}

const total = (debt, files) =>
  [...files].reduce(
    (acc, f) => {
      const d = debt.get(f)
      return d ? { bg: acc.bg + d.bg, all: acc.all + d.all } : acc
    },
    { bg: 0, all: 0 },
  )

/** A page plus every `layout.tsx` above it — what Next actually renders for that route. */
function withLayouts(pageFile) {
  const out = [pageFile]
  let dir = path.dirname(pageFile)
  while (dir !== '.' && dir !== '') {
    const layout = path.join(dir, 'layout.tsx')
    if (existsSync(path.join(ROOT, layout))) out.push(layout)
    dir = path.dirname(dir)
  }
  return out
}

/** Source files a route OWNS: its directory, minus nested directories that are routes of their own. */
function routeSeeds(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name)
      if (statSync(p).isDirectory()) {
        if (!existsSync(path.join(p, 'page.tsx'))) walk(p)
      } else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\./.test(name)) {
        out.push(path.relative(ROOT, p))
      }
    }
  }
  walk(dir)
  return out
}

function adminRouteDirs() {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name)
      if (statSync(p).isDirectory()) walk(p)
    }
    if (existsSync(path.join(d, 'page.tsx'))) out.push(path.relative(ROOT, d))
  }
  walk(ADMIN_ROOT)
  return out
}

function main() {
  const debt = debtByFile()
  const repo = total(debt, debt.keys())

  // Operator-owned code, by DIRECTORY. No graph, no assumptions — just: how much of the
  // population lives in files an operator surface is the only way to photograph?
  let operator = { bg: 0, all: 0, files: 0 }
  for (const [file, d] of debt) {
    if (file.startsWith('app/(main)/admin/') || file.startsWith('components/admin/')) {
      operator = { bg: operator.bg + d.bg, all: operator.all + d.all, files: operator.files + 1 }
    }
  }

  const watched = reachAll(WATCHED_TODAY.flatMap(withLayouts))
  const watchedTotal = total(debt, watched)

  const rows = []
  for (const dir of adminRouteDirs()) {
    const route = dir.replace(/^app\/\(main\)/, '')
    if (route.includes('[')) continue // needs a seeded id; not a stable capture target
    const files = new Set([...reach(routeSeeds(dir), 2)].filter((f) => debt.has(f)))
    rows.push({ route, files, totals: total(debt, files) })
  }
  rows.sort((a, b) => b.totals.bg - a.totals.bg || b.totals.all - a.totals.all)

  const chosen = new Set()
  for (const row of rows) if (CHOSEN.includes(row.route)) for (const f of row.files) chosen.add(f)
  const chosenTotal = total(debt, chosen)

  const all = new Set()
  for (const row of rows) for (const f of row.files) all.add(f)
  const allTotal = total(debt, all)

  const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`

  console.log('')
  console.log('DAWN debt, repo-wide (frozen ratchet basis)')
  console.log(`  raw-button-bg  ${repo.bg}`)
  console.log(`  raw <button>   ${repo.all}`)
  console.log('')
  console.log('Operator-owned code — app/(main)/admin/** + components/admin/**, by directory:')
  console.log(
    `  ${operator.bg} raw-button-bg (${pct(operator.bg, repo.bg)}) · ${operator.all} raw <button> (${pct(operator.all, repo.all)}) · ${operator.files} files`,
  )
  console.log('')
  console.log('Reachable from the surfaces watched TODAY (transitive, i.e. generous):')
  console.log(
    `  ${watchedTotal.bg} raw-button-bg (${pct(watchedTotal.bg, repo.bg)}) · ${watchedTotal.all} raw <button> (${pct(watchedTotal.all, repo.all)})`,
  )
  console.log('')

  if (!process.argv.includes('--chosen')) {
    console.log('Admin routes by own debt (route directory + 2 import hops — an UPPER BOUND):')
    console.log('    bg    btn   route')
    for (const row of rows.slice(0, 20)) {
      console.log(`  ${String(row.totals.bg).padStart(4)}  ${String(row.totals.all).padStart(5)}   ${row.route}`)
    }
    console.log('')
  }

  console.log(`The ${CHOSEN.length} routes surfaces.ts watches, and what they add:`)
  for (const route of CHOSEN) {
    const row = rows.find((r) => r.route === route)
    if (!row) {
      console.log(`  ⚠️  ${route} — NOT FOUND. The route moved or was deleted; surfaces.ts is stale.`)
      continue
    }
    console.log(`  ${String(row.totals.bg).padStart(4)}bg ${String(row.totals.all).padStart(5)}btn   ${route}`)
  }
  console.log(
    `  UNION (deduped): ${chosenTotal.bg} raw-button-bg · ${chosenTotal.all} raw <button> · ${chosen.size} files`,
  )
  console.log(
    `  against ALL ${rows.length} static admin routes: ${allTotal.bg} bg / ${allTotal.all} btn — so ${CHOSEN.length} routes hold ${pct(chosenTotal.bg, allTotal.bg)} of the admin-attributable raw-button-bg and ${pct(chosenTotal.all, allTotal.all)} of the buttons.`,
  )
  console.log('')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
