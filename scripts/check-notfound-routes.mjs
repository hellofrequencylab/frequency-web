#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARTIFACT GATE: a route that swallows an ARBITRARY URL must say "not found" out loud.
// LIVE-208 / ADR-1267. Runs in `postbuild`, on the artifact the build just wrote.
//
// 🔴 WHY THIS CANNOT BE A SOURCE GUARD, which is the whole point of it.
//
// `check:seo` reports that "every crawler-reachable page outside (marketing) declares its intent"
// and it passes. It reads SOURCE. The defect it could not see was this: `app/(main)/@wizard/
// [...catchAll]/page.tsx` — a PARALLEL-ROUTE SLOT page whose only job is to render null so a Spark
// modal closes on the next navigation (ADR-1017) — is HOISTED OUT OF ITS SLOT by the compiler into
// a real top-level route. Nothing in the source tree says so. The artifact says it in two files:
//
//     .next/routes-manifest.json        /[...catchAll]   regex  ^/(.+?)(?:/)?$
//     .next/app-path-routes-manifest    "/(main)/@wizard/[...catchAll]/page" => "/[...catchAll]"
//
// A regex that matches every path on the domain means EVERY unmatched URL matches something, so
// nothing 404s: the request resolves through the member tree and answers 200 or 307 where a 404
// belongs. That is the same SOURCE-versus-ARTIFACT split as the 2026-08-11 ENOSPC incident
// (docs/DEPLOY-SAFETY.md, ADR-1002/ADR-1003): every gate measured the source, none measured the
// artifact.
//
// ── WHAT IT ASSERTS ──────────────────────────────────────────────────────────────────────────
//
// For every built route whose regex matches an arbitrary path, the CHILDREN page that owns it must
// exist and must call `notFound()`.
//
//   * "children page" means a page whose app path contains no `@slot` segment. The distinction is
//     the defect itself: a slot page renders BESIDE `children`, never instead of it, so it renders
//     on every route in its layout — proven by instrumenting it (it logged on /events,
//     /spaces/<slug> and /market/<id> alike). A slot page therefore cannot be the thing that
//     answers "not found", and a route whose ONLY owner is a slot page is a URL the app swallows
//     silently. That is exactly the state this gate was written against.
//   * `notFound()` must be CALLED, not merely imported, and the call must survive comment
//     stripping — a comment explaining why a call was removed must never read as the call
//     (ADR-1097 cost this repo a red build on precisely that mistake).
//
// A tree with NO catch-all at all is legal and passes with nothing flagged. The gate is not "there
// must be a catch-all"; it is "if a route eats arbitrary URLs, it says so".
//
// ── WHY IT READS SOURCE FOR THE SECOND HALF ──────────────────────────────────────────────────
//
// The artifact answers the question source cannot ("which routes eat arbitrary URLs, after
// hoisting"). It is then the source of the page the ARTIFACT NAMED that says whether the answer is
// deliberate. Neither half is a substitute for the other, and the artifact half is the one that has
// to run after a build.
//
// Usage: `node scripts/check-notfound-routes.mjs` (or `pnpm check:notfound-routes`), after a build.
// `--root <dir>` points it at another tree, which is how the fixture test drives it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** URLs this app routes NOWHERE. A route whose regex matches one of these matches everything.
 *  Three shapes on purpose: one segment, several segments, and a trailing slash — a catch-all
 *  regex written `^/(.+?)(?:/)?$` matches all three, and a narrower dynamic route matches none. */
export const PROBE_PATHS = [
  '/zzz-live-208-no-such-path-9f3c2a',
  '/zzz-live-208/no-such/path-9f3c2a',
  '/zzz-live-208-no-such-path-9f3c2a/',
]

/** Whether a compiled route regex matches a URL the app declares nowhere. */
export function matchesArbitraryPath(regex) {
  let re
  try {
    re = new RegExp(regex)
  } catch {
    return false
  }
  return PROBE_PATHS.some((p) => re.test(p))
}

/** The classifier's own controls, run on every invocation.
 *
 *  🔴 A DETECTOR THAT SILENTLY STOPS DETECTING READS EXACTLY LIKE A CLEAN TREE. If `new RegExp`
 *  started throwing on Next's syntax, or the manifest changed the field name, this gate would flag
 *  nothing and print ✅ forever. So it proves the classifier against a known catch-all regex and a
 *  known narrow one before it trusts a single reading. */
export const CLASSIFIER_CONTROLS = [
  { regex: '^/(.+?)(?:/)?$', expect: true, why: "Next's own catch-all regex, the LIVE-208 shape" },
  { regex: '^/events/([^/]+?)(?:/)?$', expect: false, why: 'a one-segment dynamic route' },
  { regex: '^/events/([^/]+?)/manage(?:/)?$', expect: false, why: 'a deeper dynamic route' },
]

/** `/(main)/[...catchAll]/page` → `app/(main)/[...catchAll]/page.tsx`, if it is on disk. */
export function sourceFileFor(appPath, root) {
  const base = path.join(root, 'app', appPath.replace(/^\//, ''))
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

/** A parallel-route slot page (`/(main)/@wizard/[...catchAll]/page`) rather than a children page. */
export const isSlotPage = (appPath) => appPath.split('/').some((seg) => seg.startsWith('@'))

/** Strip comments before looking for a call. A comment explaining why a call was REMOVED must not
 *  read as the call (ADR-1097). */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Whether a page module actually calls `notFound()` (imported from next/navigation). */
export function callsNotFound(src) {
  const code = stripComments(src)
  const imports = /from\s+['"]next\/navigation['"]/.test(code) && /\bnotFound\b/.test(code)
  const calls = /\bnotFound\s*\(\s*\)/.test(code)
  return imports && calls
}

/**
 * Read the built manifests and work out which routes eat arbitrary URLs and who owns them.
 * Pure over the file system: no printing, no exit. Returns `null` when there is nothing to read.
 */
export function measureRoutes(root = process.cwd()) {
  const routesFile = path.join(root, '.next', 'routes-manifest.json')
  const appPathsFile = path.join(root, '.next', 'app-path-routes-manifest.json')
  if (!existsSync(routesFile) || !existsSync(appPathsFile)) return null

  let routes
  let appPaths
  try {
    routes = JSON.parse(readFileSync(routesFile, 'utf8'))
    appPaths = JSON.parse(readFileSync(appPathsFile, 'utf8'))
  } catch {
    return null
  }

  const dynamicRoutes = Array.isArray(routes.dynamicRoutes) ? routes.dynamicRoutes : []
  const staticRoutes = Array.isArray(routes.staticRoutes) ? routes.staticRoutes : []
  const all = [...dynamicRoutes, ...staticRoutes]

  const flagged = all
    .filter((r) => typeof r?.regex === 'string' && matchesArbitraryPath(r.regex))
    .map((r) => {
      const owners = Object.entries(appPaths)
        .filter(([, routePath]) => routePath === r.page)
        .map(([appPath]) => {
          const file = sourceFileFor(appPath, root)
          return {
            appPath,
            file: file ? path.relative(root, file) : null,
            slot: isSlotPage(appPath),
            notFound: file ? callsNotFound(readFileSync(file, 'utf8')) : false,
          }
        })
      return { page: r.page, regex: r.regex, owners }
    })

  return {
    dynamicRoutes: dynamicRoutes.length,
    staticRoutes: staticRoutes.length,
    appPaths: Object.keys(appPaths).length,
    flagged,
  }
}

/** Non-triviality floors. A manifest smaller than this is not the artifact this gate can judge, and
 *  every "nothing flagged" below it would be a false clean bill of health. Production has read
 *  171 dynamic + 285 static routes and 490+ app paths; these sit well under that and move only
 *  beside a real, named deletion. */
export const MIN_ROUTES = 200
export const MIN_APP_PATHS = 200

/** Judge a reading. Returns `{ failures, lines }`; `failures` empty means the gate passes. */
export function evaluate(m) {
  const failures = []

  for (const c of CLASSIFIER_CONTROLS) {
    if (matchesArbitraryPath(c.regex) !== c.expect) {
      failures.push(
        `the arbitrary-path classifier is broken: ${c.regex} (${c.why}) should read ` +
          `${c.expect ? 'MATCHING' : 'not matching'} and does not. Every verdict below is meaningless.`,
      )
    }
  }
  if (failures.length > 0) return { failures, lines: [] }

  if (m === null) {
    return {
      failures: ['no .next/routes-manifest.json + .next/app-path-routes-manifest.json to read, or they did not parse.'],
      lines: [],
    }
  }

  const routeCount = m.dynamicRoutes + m.staticRoutes
  if (routeCount < MIN_ROUTES) {
    failures.push(
      `only ${routeCount} route(s) in routes-manifest.json (floor ${MIN_ROUTES}). The manifest did not\n` +
        `   parse, or the build did not finish — a "nothing flagged" reading below would be a false zero.`,
    )
  }
  if (m.appPaths < MIN_APP_PATHS) {
    failures.push(
      `only ${m.appPaths} app path(s) in app-path-routes-manifest.json (floor ${MIN_APP_PATHS}). Without it\n` +
        `   no flagged route can be attributed to a page, and every route would look unowned.`,
    )
  }
  if (failures.length > 0) return { failures, lines: [] }

  for (const r of m.flagged) {
    if (r.owners.length === 0) {
      failures.push(
        `${r.page} matches every URL on the domain (regex ${r.regex}) and NO page in\n` +
          `   app-path-routes-manifest.json owns it. Nothing in the tree can be read to find out what it\n` +
          `   serves.`,
      )
      continue
    }
    const children = r.owners.filter((o) => !o.slot)
    if (children.length === 0) {
      failures.push(
        `${r.page} matches every URL on the domain (regex ${r.regex}) and its only owner(s) are\n` +
          `   PARALLEL-ROUTE SLOT pages:\n` +
          r.owners.map((o) => `     ${o.appPath}`).join('\n') +
          `\n   A slot page renders BESIDE \`children\`, on every route in its layout, so it cannot be the\n` +
          `   thing that answers "not found" — and with no children page at this route every unmatched\n` +
          `   URL resolves through the layout above it instead of 404ing. This is LIVE-208 exactly\n` +
          `   (ADR-1267). Add the children page beside the slot and have it call notFound().`,
      )
      continue
    }
    for (const o of children) {
      if (!o.file) {
        failures.push(
          `${r.page} matches every URL on the domain and its owner ${o.appPath} has no source file\n` +
            `   under app/. The manifest and the tree disagree; nothing here can be verified.`,
        )
      } else if (!o.notFound) {
        failures.push(
          `${r.page} matches every URL on the domain (regex ${r.regex}) and ${o.file}\n` +
            `   does not call notFound(). A route that eats arbitrary URLs must say so out loud, or every\n` +
            `   dead link on the domain answers with whatever that page renders (ADR-1267).`,
        )
      }
    }
  }

  const lines = [
    `${m.dynamicRoutes} dynamic + ${m.staticRoutes} static routes read (floor ${MIN_ROUTES}), ` +
      `${m.appPaths} app paths (floor ${MIN_APP_PATHS}).`,
    m.flagged.length === 0
      ? 'no route matches an arbitrary URL.'
      : `${m.flagged.length} route(s) match an arbitrary URL, and their owner(s) are:`,
    ...m.flagged.map(
      (r) =>
        `  ${r.page}  ←  ` +
        r.owners
          .map((o) => `${o.appPath}${o.slot ? ' (slot)' : o.notFound ? ' (notFound)' : ''}`)
          .join(' + '),
    ),
  ]
  return { failures, lines }
}

/** The CLI. `--root <dir>` points at a tree other than the working directory (the fixture test). */
export function main(argv = process.argv.slice(2)) {
  const rootFlag = argv.indexOf('--root')
  const root = rootFlag !== -1 && argv[rootFlag + 1] ? path.resolve(argv[rootFlag + 1]) : process.cwd()

  if (!existsSync(path.join(root, '.next'))) {
    console.error('check:notfound-routes — no .next. Run `pnpm build` first.')
    return 1
  }

  // The same honesty line the other artifact gates print (HYG-014): a LOCAL read is a smoke test,
  // not evidence about what the deploy serves.
  if (process.env.VERCEL !== '1') {
    console.warn(
      'ℹ️  check:notfound-routes is reading a LOCAL .next, not the deploy artifact. Its verdict is a\n' +
        '   smoke test, NOT evidence about production. Read the `postbuild` output of the real deployment.',
    )
  }

  const { failures, lines } = evaluate(measureRoutes(root))

  if (failures.length > 0) {
    console.error(`\n🔴 check:notfound-routes — ${failures.length} problem(s) in the built route table.\n`)
    for (const f of failures) console.error(`   ✗ ${f}\n`)
    if (lines.length > 0) {
      console.error('   Measured:')
      for (const l of lines) console.error(`     ${l}`)
    }
    console.error(
      '\n   The fix is a page, not a budget: the route that eats arbitrary URLs needs a children page\n' +
        '   that calls notFound(). See docs/DECISIONS.md ADR-1267 and app/(main)/[...catchAll]/page.tsx.\n',
    )
    return 1
  }

  console.log('✅ check:notfound-routes — every route that eats arbitrary URLs says "not found" out loud.')
  for (const l of lines) console.log(`   ${l}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main())
}
