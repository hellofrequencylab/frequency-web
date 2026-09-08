import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  matchesArbitraryPath,
  callsNotFound,
  isSlotPage,
  sourceFileFor,
  measureRoutes,
  evaluate,
  main,
  MIN_ROUTES,
  MIN_APP_PATHS,
  CLASSIFIER_CONTROLS,
} from './check-notfound-routes.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FIXTURE TEST FOR THE ARTIFACT GATE (LIVE-208, ADR-1267).
//
// `check:notfound-routes` runs in `postbuild`, so on a PR it never runs: CI never builds
// (docs/DEPLOY-SAFETY.md, ADR-1003). This file is what runs on every PR instead. It drives the
// gate's real functions against SYNTHETIC `.next` trees — including a faithful reconstruction of
// the LIVE-208 artifact, which MUST fail — so the gate cannot rot into something that prints ✅
// over a route table it no longer understands.
//
// The reconstruction is the important half. A gate whose only evidence is "it passed on the fixed
// tree" is indistinguishable from a gate that passes on everything.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A synthetic tree: `.next` manifests plus the `app/` sources the gate resolves owners to. */
function fixture(opts: {
  routes?: { page: string; regex: string }[]
  appPaths?: Record<string, string>
  files?: Record<string, string>
  routeCount?: number
  appPathCount?: number
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nf-routes-'))
  const next = path.join(root, '.next')
  mkdirSync(next, { recursive: true })

  // Pad both manifests past the non-triviality floors with routes that match nothing arbitrary, so
  // a fixture proves the arm it is about rather than tripping a floor by being small.
  const pad = Array.from({ length: opts.routeCount ?? MIN_ROUTES + 10 }, (_, i) => ({
    page: `/pad-${i}/[slug]`,
    regex: `^/pad\\-${i}/([^/]+?)(?:/)?$`,
  }))
  writeFileSync(
    path.join(next, 'routes-manifest.json'),
    JSON.stringify({ dynamicRoutes: [...pad, ...(opts.routes ?? [])], staticRoutes: [] }),
  )
  const padPaths = Object.fromEntries(
    Array.from({ length: opts.appPathCount ?? MIN_APP_PATHS + 10 }, (_, i) => [`/pad-${i}/[slug]/page`, `/pad-${i}/[slug]`]),
  )
  writeFileSync(
    path.join(next, 'app-path-routes-manifest.json'),
    JSON.stringify({ ...padPaths, ...(opts.appPaths ?? {}) }),
  )

  for (const [rel, body] of Object.entries(opts.files ?? {})) {
    const file = path.join(root, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return root
}

const NOT_FOUND_PAGE = `import { notFound } from 'next/navigation'\nexport default function P() { notFound() }\n`
const NULL_PAGE = `export default function P() { return null }\n`
const CATCH_ALL = { page: '/[...catchAll]', regex: '^/(.+?)(?:/)?$' }

const roots: string[] = []
const make = (opts: Parameters<typeof fixture>[0]) => {
  const r = fixture(opts)
  roots.push(r)
  return r
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

describe('the classifier', () => {
  it('reads its own declared controls the way it says it does', () => {
    // Not a restatement: if a control were dropped from the array the gate would stop proving
    // itself and this test would still pass, so the floor is asserted too.
    expect(CLASSIFIER_CONTROLS.length).toBeGreaterThanOrEqual(3)
    for (const c of CLASSIFIER_CONTROLS) expect(matchesArbitraryPath(c.regex), c.why).toBe(c.expect)
  })

  it('flags a catch-all regex and spares every narrower route', () => {
    expect(matchesArbitraryPath('^/(.+?)(?:/)?$')).toBe(true)
    expect(matchesArbitraryPath('^/(?:/)?$')).toBe(false)
    expect(matchesArbitraryPath('^/events(?:/)?$')).toBe(false)
    expect(matchesArbitraryPath('^/events/([^/]+?)(?:/)?$')).toBe(false)
    expect(matchesArbitraryPath('^/spaces/([^/]+?)/podcasts/([^/]+?)(?:/)?$')).toBe(false)
  })

  it('treats an unparseable regex as "cannot tell", never as a match', () => {
    expect(matchesArbitraryPath('^/(unclosed')).toBe(false)
  })

  it('knows a slot page from a children page', () => {
    expect(isSlotPage('/(main)/@wizard/[...catchAll]/page')).toBe(true)
    expect(isSlotPage('/(main)/[...catchAll]/page')).toBe(false)
    expect(isSlotPage('/(main)/events/[slug]/page')).toBe(false)
  })

  it('reads notFound() as a CALL, not as a mention', () => {
    expect(callsNotFound(NOT_FOUND_PAGE)).toBe(true)
    expect(callsNotFound(NULL_PAGE)).toBe(false)
    // Import without a call is not a not-found page.
    expect(callsNotFound(`import { notFound } from 'next/navigation'\nexport default () => null\n`)).toBe(false)
    // 🔴 ADR-1097: a comment explaining a REMOVED call must never read as the call.
    expect(
      callsNotFound(`import { notFound } from 'next/navigation'\n// we used to notFound() here\nexport default () => null\n`),
    ).toBe(false)
    expect(
      callsNotFound(`import { notFound } from 'next/navigation'\n/* notFound() was removed */\nexport default () => null\n`),
    ).toBe(false)
    // A notFound from somewhere that is not the router is not this call.
    expect(callsNotFound(`import { notFound } from './local'\nexport default () => notFound()\n`)).toBe(false)
  })
})

describe('the gate on synthetic artifacts', () => {
  it('🔴 FAILS on a reconstruction of the LIVE-208 artifact — a slot page as the only owner', () => {
    const root = make({
      routes: [CATCH_ALL],
      appPaths: { '/(main)/@wizard/[...catchAll]/page': '/[...catchAll]' },
      files: { 'app/(main)/@wizard/[...catchAll]/page.tsx': NULL_PAGE },
    })
    const { failures } = evaluate(measureRoutes(root))
    expect(failures.length).toBeGreaterThan(0)
    expect(failures.join('\n')).toMatch(/SLOT/)
    expect(main(['--root', root])).toBe(1)
  })

  it('passes once a children page beside the slot calls notFound()', () => {
    const root = make({
      routes: [CATCH_ALL],
      appPaths: {
        '/(main)/@wizard/[...catchAll]/page': '/[...catchAll]',
        '/(main)/[...catchAll]/page': '/[...catchAll]',
      },
      files: {
        'app/(main)/@wizard/[...catchAll]/page.tsx': NULL_PAGE,
        'app/(main)/[...catchAll]/page.tsx': NOT_FOUND_PAGE,
      },
    })
    expect(evaluate(measureRoutes(root)).failures).toEqual([])
    expect(main(['--root', root])).toBe(0)
  })

  it('FAILS when the children owner exists but renders something instead of notFound()', () => {
    const root = make({
      routes: [CATCH_ALL],
      appPaths: { '/(main)/[...catchAll]/page': '/[...catchAll]' },
      files: { 'app/(main)/[...catchAll]/page.tsx': NULL_PAGE },
    })
    const { failures } = evaluate(measureRoutes(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toMatch(/does not call notFound/)
  })

  it('FAILS when the manifest names an owner that is not in the tree', () => {
    const root = make({
      routes: [CATCH_ALL],
      appPaths: { '/(main)/[...catchAll]/page': '/[...catchAll]' },
    })
    expect(evaluate(measureRoutes(root)).failures.join('\n')).toMatch(/no source file/)
  })

  it('FAILS when a route that eats every URL has no owner at all', () => {
    const root = make({ routes: [CATCH_ALL] })
    expect(evaluate(measureRoutes(root)).failures.join('\n')).toMatch(/NO page in/)
  })

  it('passes a tree with no catch-all at all — the gate is not "there must be one"', () => {
    const root = make({})
    const { failures, lines } = evaluate(measureRoutes(root))
    expect(failures).toEqual([])
    expect(lines.join('\n')).toMatch(/no route matches an arbitrary URL/)
  })

  it('🔴 REFUSES a manifest too small to judge, rather than reporting it clean', () => {
    // The false-zero arm. Without the floors, a manifest that failed to parse into routes reads
    // exactly like a tree with nothing wrong — the "I never looked" vs "I looked and it was fine"
    // confusion this repo has been bitten by more than once.
    const root = make({ routeCount: 3, appPathCount: 3 })
    const { failures } = evaluate(measureRoutes(root))
    expect(failures.length).toBeGreaterThan(0)
    expect(failures.join('\n')).toMatch(/floor/)
  })

  it('refuses a tree with no .next rather than passing it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nf-empty-'))
    roots.push(root)
    expect(measureRoutes(root)).toBe(null)
    expect(evaluate(null).failures.length).toBe(1)
    expect(main(['--root', root])).toBe(1)
  })

  it('refuses manifests that do not parse', () => {
    const root = make({})
    writeFileSync(path.join(root, '.next', 'routes-manifest.json'), '{ not json')
    expect(measureRoutes(root)).toBe(null)
  })
})

describe('the real tree', () => {
  it('resolves the committed catch-all pages to their real files', () => {
    // Cross-checks the manifest→source resolver against the actual repo, so a rename that made the
    // resolver silently return null (and every owner look unowned) fails here rather than in
    // postbuild on a deploy.
    const root = path.join(import.meta.dirname, '..')
    expect(sourceFileFor('/(main)/[...catchAll]/page', root)).not.toBe(null)
    expect(sourceFileFor('/(main)/@wizard/[...catchAll]/page', root)).not.toBe(null)
    expect(sourceFileFor('/(main)/no-such-page-9f3c2a/page', root)).toBe(null)
  })

  it('the committed children catch-all is an explicit not-found and the slot closer is not', () => {
    const root = path.join(import.meta.dirname, '..')
    const children = sourceFileFor('/(main)/[...catchAll]/page', root)!
    const slot = sourceFileFor('/(main)/@wizard/[...catchAll]/page', root)!
    expect(callsNotFound(readFileSync(children, 'utf8'))).toBe(true)
    // 🔴 The slot closer must KEEP returning null: it renders on every route in the layout.
    expect(callsNotFound(readFileSync(slot, 'utf8'))).toBe(false)
    expect(readFileSync(slot, 'utf8')).toMatch(/return null/)
  })
})

describe('the built artifact, when there is one', () => {
  const root = path.join(import.meta.dirname, '..')
  const built = existsSync(path.join(root, '.next', 'routes-manifest.json'))

  beforeAll(() => {
    if (!built) {
      // Loud, not silent: a skipped arm that reads as a pass is the failure mode this repo names
      // in ADR-970. postbuild is where this arm really runs.
      console.warn('check-notfound-routes.test: no local .next — the built-artifact arm did not run.')
    }
  })

  it.runIf(built)('reads clean on the tree as built here', () => {
    expect(evaluate(measureRoutes(root)).failures).toEqual([])
  })
})
