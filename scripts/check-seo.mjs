#!/usr/bin/env node
// SEO / sitemap coherence guard — keeps app/sitemap.ts and the real route tree in sync.
//
// The sitemap is our advertised map of the public site. Two silent failure modes rot it:
//
//   1. SEO GAP — a forward-facing marketing page ships but never gets a sitemap entry, so
//      it stays out of the index and out of AI-crawl (CONTENT-VOICE §8). Invisible pages.
//   2. DEAD ENTRY — a hand-written sitemap route points at a path that no longer has a
//      backing page, so the sitemap advertises a 404 (Search Console: "Submitted URL not
//      found"). This is the class of bug that just cost /events its canonical.
//
// This is a COARSE, filesystem-only static check (no build, no DB). It reasons ONLY about
// the STATIC, hand-written surface — the part a human maintains by hand and therefore
// forgets. It deliberately ignores the dynamic/registry-driven sections of the sitemap
// (COMPARISONS / personaSlugs / the pillar array / help content / discover DB reads):
// those are generated from a source of truth, so they cannot silently drift.
//
// It runs TWO scans:
//   A. COVERAGE — every STATIC (non-[param]) app/(marketing)/<slug>/page.tsx (+ the
//      homepage app/page.tsx) must be advertised: its route appears in sitemap.ts as a
//      literal `${SITE_URL}/…` entry, OR it is in INTENTIONALLY_EXCLUDED below with a
//      one-line reason (redirect stubs, noindex checkout/confirm, operator-only funnels).
//   B. RESOLUTION — every literal `${SITE_URL}/<path>` static entry in sitemap.ts must
//      resolve to a real page.tsx / route.ts under app/ (resolving through route groups
//      like (marketing)/(main)/(help)). No backing file → the entry is dead.
//
// LOW-FALSE-POSITIVE by construction. It hard-fails ONLY on (a) a static marketing page
// neither advertised nor allowlisted, or (b) a literal static sitemap route with no
// backing file. Anything it cannot resolve with confidence is a WARNING, never a failure,
// so it will not break CI on a legitimate page. The allowlist is curated by actually
// reading each excluded page (redirect / noindex), never to silence the check.
//
// Usage: `node scripts/check-seo.mjs` (or `pnpm check:seo`). Exits non-zero on a real gap.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = 'app'
const MARKETING_DIR = join(APP_DIR, '(marketing)')
const SITEMAP_FILE = join(APP_DIR, 'sitemap.ts')

// Static forward-facing pages that are DELIBERATELY not advertised in the sitemap. Each
// entry carries the real, verified reason (grep the page: redirect / noindex). Do NOT add
// a page here just to silence the check — a genuinely public page belongs in sitemap.ts.
// Audited 2026-07-02 against the pages themselves.
const INTENTIONALLY_EXCLUDED = new Map([
  ['/build', '308 permanentRedirect → /the-community (retired Mode page; old links + SEO consolidate onto canonical)'],
  ['/how-it-works', '308 permanentRedirect → /the-community (retired; ranking signals consolidate on canonical)'],
  ['/practice', '308 permanentRedirect → /the-quest (retired Mode page)'],
  ['/spread', '308 permanentRedirect → /the-community (retired Mode page)'],
  ['/demo', '308 permanentRedirect → /the-community (retired; no redirect chain for crawlers, SEO-1)'],
  ['/lead-funnel-kit', 'robots noindex — operator-only funnel infographic, not a crawl target'],
  ['/beta/confirm', 'robots noindex — double-opt-in confirmation landing (transactional)'],
  ['/founders/checkout', 'robots noindex — Stripe checkout hand-off (gate lives in the action)'],
  ['/founders/checkout/success', 'robots noindex — post-payment founding-membership confirm'],
])

// ── Route helpers ─────────────────────────────────────────────────────────────

/** Recursively collect files named `page.tsx`/`route.ts` (and .js/.jsx/.ts variants) under a dir. */
function collectRouteFiles(dir, kinds) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectRouteFiles(p, kinds))
    } else {
      const base = entry.name.replace(/\.(tsx?|jsx?)$/, '')
      const ext = entry.name.match(/\.(tsx?|jsx?)$/)
      if (ext && kinds.includes(base)) out.push(p)
    }
  }
  return out
}

/**
 * Map an app-router file to its URL route, dropping route-group segments like `(marketing)`
 * and `(main)`. Dynamic segments (`[slug]`, `[...all]`, `[[...opt]]`) are left intact so the
 * caller can tell static from dynamic. Returns e.g. '/', '/founders/offer', '/events/[slug]'.
 */
function routeForFile(file) {
  const rel = relative(APP_DIR, file)
  const parts = rel.split(sep)
  parts.pop() // drop the page.tsx / route.ts filename
  const segs = parts.filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  if (segs.length === 0) return '/'
  return '/' + segs.join('/')
}

const isDynamic = (route) => route.includes('[')

/** Normalize a URL path: strip a trailing slash, but keep the root as '/'. */
function normalize(route) {
  if (route === '/') return '/'
  return route.replace(/\/+$/, '')
}

/** Does a concrete static path `r` match a dynamic route pattern (for the WARNING path only)? */
function matchesDynamicPattern(r, patterns) {
  const rSegs = r === '/' ? [] : r.slice(1).split('/')
  for (const pat of patterns) {
    const pSegs = pat === '/' ? [] : pat.slice(1).split('/')
    let ok = true
    let i = 0
    for (; i < pSegs.length; i++) {
      const ps = pSegs[i]
      if (ps.startsWith('[...') || ps.startsWith('[[...')) {
        ok = true // catch-all soaks up the rest
        i = rSegs.length
        break
      }
      if (i >= rSegs.length) { ok = false; break }
      if (ps.startsWith('[')) continue // single dynamic segment matches anything
      if (ps !== rSegs[i]) { ok = false; break }
    }
    if (ok && i === rSegs.length) return pat
  }
  return null
}

// ── Extract the literal static routes advertised in sitemap.ts ──────────────────
// Only pure `${SITE_URL}/<literal>` template strings — the hand-written entries. Any entry
// with further interpolation (`${SITE_URL}${personaPath(...)}`, `${SITE_URL}/help/${a.slug}`,
// `${SITE_URL}/spaces/${s.slug}`, …) is registry/DB-driven and is EXCLUDED by construction:
// the `[^`$]*` class stops at the first `$`, so an interpolated path never reaches the
// closing backtick and never matches.
function sitemapLiteralRoutes() {
  const src = readFileSync(SITEMAP_FILE, 'utf8')
  const re = /`\$\{SITE_URL\}(\/[^`$]*)`/g
  const routes = new Set()
  let m
  while ((m = re.exec(src)) !== null) {
    routes.add(normalize(m[1]))
  }
  return routes
}

// ── Scans ───────────────────────────────────────────────────────────────────

function run() {
  const failures = []
  const warnings = []

  // Build the real route tree (static + dynamic) from page.tsx AND route.ts backers.
  const allFiles = collectRouteFiles(APP_DIR, ['page', 'route'])
  const staticRoutes = new Set()
  const dynamicPatterns = []
  for (const f of allFiles) {
    const route = normalize(routeForFile(f))
    if (isDynamic(route)) dynamicPatterns.push(route)
    else staticRoutes.add(route)
  }

  const advertised = sitemapLiteralRoutes()

  // Sanity-check the allowlist itself so it can't rot silently (warnings only).
  const marketingFiles = collectRouteFiles(MARKETING_DIR, ['page'])
  const marketingStaticRoutes = new Set(
    marketingFiles.map((f) => normalize(routeForFile(f))).filter((r) => !isDynamic(r)),
  )
  for (const [route, reason] of INTENTIONALLY_EXCLUDED) {
    if (advertised.has(route)) {
      warnings.push(`allowlist: ${route} is BOTH excluded and advertised in sitemap.ts — drop one. (${reason})`)
    }
    if (!marketingStaticRoutes.has(route) && !staticRoutes.has(route)) {
      warnings.push(`allowlist: ${route} has no backing page — stale exclusion, remove it. (${reason})`)
    }
  }

  // ── Scan A: COVERAGE — every static forward-facing page is advertised or excluded. ──
  // Forward-facing = every static page under app/(marketing) + the homepage app/page.tsx.
  const forwardFacing = [...marketingFiles]
  const homepage = join(APP_DIR, 'page.tsx')
  if (existsSync(homepage)) forwardFacing.push(homepage)

  const coverageChecked = []
  for (const file of forwardFacing) {
    const route = normalize(routeForFile(file))
    if (isDynamic(route)) continue // dynamic pages are registry/DB-driven, not this check
    coverageChecked.push(route)
    if (advertised.has(route)) continue
    if (INTENTIONALLY_EXCLUDED.has(route)) continue
    failures.push({
      kind: 'SEO GAP',
      detail: `forward-facing page ${relative('.', file)} → route ${route} is NOT in the sitemap and NOT allowlisted`,
    })
  }

  // ── Scan B: RESOLUTION — every literal sitemap route resolves to a real backer. ──
  const resolutionChecked = []
  for (const route of advertised) {
    resolutionChecked.push(route)
    if (staticRoutes.has(route)) continue
    const dyn = matchesDynamicPattern(route, dynamicPatterns)
    if (dyn) {
      warnings.push(`sitemap route ${route} has no static page but matches dynamic route ${dyn} — verify it renders (not failing).`)
      continue
    }
    failures.push({
      kind: 'DEAD ENTRY',
      detail: `sitemap.ts advertises ${route} but no page.tsx / route.ts resolves to it (advertised 404)`,
    })
  }

  return { failures, warnings, coverageChecked, resolutionChecked }
}

function main() {
  const { failures, warnings, coverageChecked, resolutionChecked } = run()

  console.log(
    `SEO/sitemap coherence — checked ${coverageChecked.length} forward-facing page(s) for coverage ` +
      `and ${resolutionChecked.length} literal sitemap route(s) for resolution.`,
  )

  for (const w of warnings) console.warn(`  ⚠ ${w}`)

  if (failures.length > 0) {
    console.error('\n✗ SEO/sitemap coherence check failed:\n')
    for (const f of failures) console.error(`  • [${f.kind}] ${f.detail}`)
    console.error(
      '\nFix a SEO GAP by adding the route to app/sitemap.ts staticRoutes (or, if the page is a\n' +
        'redirect stub / noindex / auth-walled, add it to INTENTIONALLY_EXCLUDED in this script WITH\n' +
        'a verified reason). Fix a DEAD ENTRY by removing the stale route from app/sitemap.ts or\n' +
        'restoring its backing page. See docs/PAGE-FRAMEWORK.md + app/sitemap.ts / app/robots.ts.\n',
    )
    process.exit(1)
  }

  console.log(
    '✓ SEO/sitemap coherence — every static marketing page is advertised or consciously excluded,\n' +
      '  and every literal sitemap route resolves to a real page.',
  )
}

// Only run the CLI when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}

export { run, routeForFile, sitemapLiteralRoutes, INTENTIONALLY_EXCLUDED }
