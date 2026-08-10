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
// It runs THREE scans:
//   A. COVERAGE — every STATIC (non-[param]) app/(marketing)/<slug>/page.tsx (+ the
//      homepage app/page.tsx) must be advertised: its route appears in sitemap.ts as a
//      literal `${SITE_URL}/…` entry, OR it is in INTENTIONALLY_EXCLUDED below with a
//      one-line reason (redirect stubs, noindex checkout/confirm, operator-only funnels).
//   B. RESOLUTION — every literal `${SITE_URL}/<path>` static entry in sitemap.ts must
//      resolve to a real page.tsx / route.ts under app/ (resolving through route groups
//      like (marketing)/(main)/(help)). No backing file → the entry is dead.
//   C. DECLARATION — every static page OUTSIDE (marketing) that a crawler can actually
//      reach must SAY what it wants: advertised in the sitemap, or carrying its own
//      `robots: { index: false }`. Silence is the bug (see below).
//
// ---------------------------------------------------------------------------------------
// SCAN C — added 2026-08-05 (Phase 9, docs/DAWN-CONVERSION.md §4).
// ---------------------------------------------------------------------------------------
// A and B both look only at app/(marketing), which quietly assumes every indexable page
// lives there. It does not. /market, /housing and /classifieds are real, crawlable routes
// under app/(main) — deliberately left OUT of the robots.ts DISALLOW list so crawlers walk
// through them to the indexable /<vertical>/<id> detail pages — and this gate had never
// looked at one of them. Whether they were indexed, noindexed, or silent was not something
// it could report either way.
//
// The rule Scan C applies is INTENT, not indexing: a crawlable page must declare itself.
// Being advertised is a declaration; `robots: { index: false }` is a declaration; saying
// nothing leaves the decision to the crawler, and that is the failure mode.
//
// "Correctly private" pages are skipped rather than nagged, and the skip is derived from
// the code that actually makes them private rather than from a hand-kept list here:
//   * app/robots.ts `DISALLOW` — the crawler is told not to fetch them at all.
//   * proxy.ts `PROTECTED_PATHS` — an anonymous request is redirected to /sign-in.
//   * an in-page auth guard (requireAdmin / requireLeadFloor / …) or a redirect stub —
//     the surfaces whose wall is the page's own first statement. Reading the VIEWER is not
//     a wall: see the PAGE_GUARD note on why getMyProfileId is deliberately not a signal.
// Both lists are PARSED, so when a path is added to either, this gate follows on its own.
// A page's own layout chain is read too: app/(main)/pages/layout.tsx noindexes its whole
// subtree, and a per-page-only reader would have called those pages undeclared.
//
// LOW-FALSE-POSITIVE by construction. It hard-fails ONLY on (a) a static marketing page
// neither advertised nor allowlisted, (b) a literal static sitemap route with no backing
// file, or (c) a crawler-reachable page that declares nothing (or contradicts itself by
// being noindex AND advertised). Anything it cannot resolve with confidence is a WARNING,
// never a failure, so it will not break CI on a legitimate page. The allowlist is curated
// by actually reading each excluded page (redirect / noindex), never to silence the check.
//
// Usage: `node scripts/check-seo.mjs` (or `pnpm check:seo`). Exits non-zero on a real gap.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = 'app'
const MARKETING_DIR = join(APP_DIR, '(marketing)')
const SITEMAP_FILE = join(APP_DIR, 'sitemap.ts')
const ROBOTS_FILE = join(APP_DIR, 'robots.ts')
const PROXY_FILE = 'proxy.ts'
const SITE_FILE = join('lib', 'site.ts')

const readFile = (p) => { try { return readFileSync(p, 'utf8') } catch { return null } }

/** The brand string the root `title.template` appends, read from its one source rather than
 *  hardcoded — rename the site and this gate follows instead of going quietly blind. */
export function siteName(src) {
  return /export const SITE_NAME\s*=\s*["'`]([^"'`]+)["'`]/.exec(src ?? '')?.[1] ?? null
}

// Static forward-facing pages that are DELIBERATELY not advertised in the sitemap. Each
// entry carries the real, verified reason (grep the page: redirect / noindex). Do NOT add
// a page here just to silence the check — a genuinely public page belongs in sitemap.ts.
// Audited 2026-07-02 against the pages themselves.
const INTENTIONALLY_EXCLUDED = new Map([
  ['/build', '308 permanentRedirect → /the-community (retired Mode page; old links + SEO consolidate onto canonical)'],
  ['/how-it-works', '308 permanentRedirect → /what-is-frequency (consolidated explainer, ADR-811 IA)'],
  ['/practice', '308 permanentRedirect → /the-quest (retired Mode page)'],
  ['/spread', '308 permanentRedirect → /the-community (retired Mode page)'],
  ['/demo', '308 permanentRedirect → /the-community (retired; no redirect chain for crawlers, SEO-1)'],
  ['/lead-funnel-kit', '308 permanentRedirect → /tools-for-community-builders (retired operator preview, ADR-811 IA)'],
  // ── ADR-811 IA consolidation (2026-07-24): overlapping SEO guides merged into authoritative
  //    pillars; each retired guide is a 308 redirect that transfers ranking equity to its pillar. ──
  ['/life-after-the-feed', '308 permanentRedirect → /loneliness (absorbed into the loneliness/third-place pillar)'],
  ['/what-is-a-third-space', '308 permanentRedirect → /loneliness (absorbed into the loneliness/third-place pillar)'],
  ['/meet-people-new-city', '308 permanentRedirect → /friendship-as-an-adult (absorbed into the making-friends pillar)'],
  ['/find-like-minded-people', '308 permanentRedirect → /friendship-as-an-adult (absorbed into the making-friends pillar)'],
  ['/how-to-reconnect-with-old-friends', '308 permanentRedirect → /friendship-as-an-adult (absorbed into the making-friends pillar)'],
  ['/feel-less-awkward-in-groups', '308 permanentRedirect → /how-to-be-more-social (absorbed into the social-confidence pillar)'],
  ['/social-life-without-drinking', '308 permanentRedirect → /how-to-be-more-social (absorbed into the social-confidence pillar)'],
  ['/host-a-recurring-gathering', '308 permanentRedirect → /how-to-build-community (absorbed into the builder pillar)'],
  ['/how-to-run-a-community-space', '308 permanentRedirect → /how-to-build-community (absorbed into the builder pillar)'],
  ['/subscribe/confirm', 'robots noindex — double-opt-in confirmation landing (transactional)'],
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
 * caller can tell static from dynamic. Returns e.g. '/', '/pricing', '/events/[slug]'.
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

// ── Scan C helpers: who is private, who declared themselves ────────────────────

/** Blank comment bodies so PROSE about noindex (or a path) is never read as a declaration.
 *  The same defect check:adoption's stripComments fixed: app/robots.ts's own comment quotes
 *  `"/spaces"` while arguing AGAINST a blanket /spaces rule, and a naive parser adopted it. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|\n)([ \t]*\/\/[^\n]*)/g, (_m, lead, body) => lead + body.replace(/[^\n]/g, ' '))
}

/** Read a `const <NAME> = [ '…', '…' ]` string array out of a source file. Throws rather than
 *  returning empty: a silent [] would turn every private surface into a reported gap (noise) or,
 *  worse, be read as "nothing is private". A gate that cannot find its input must say so. */
export function parsePathList(file, name) {
  const src = stripComments(readFileSync(file, 'utf8'))
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\]`))
  if (!m) throw new Error(`check-seo: could not find \`const ${name} = [...]\` in ${file}. It is the source of truth for which routes are private; fix this parser rather than dropping the scan.`)
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1])
}

/** Does route `r` fall under one of the private prefixes? A trailing `/` prefix (e.g. `/join/`)
 *  walls the SUBTREE ONLY — `/join` itself is not covered, exactly as robots.txt reads it — while a
 *  bare prefix walls the route and its subtree. Matching is per SEGMENT, so `/admin` never swallows
 *  `/administration`; that is narrower than proxy.ts's literal `startsWith`, and narrower is the
 *  safe direction here (it checks a page rather than excusing one). */
export function isPrivateRoute(r, prefixes) {
  return prefixes.some((p) => (p.endsWith('/') ? r.startsWith(p) : r === p || r.startsWith(`${p}/`)))
}

// The page's own wall: `require*` (lib/admin/guard — these throw or redirect by contract), and the
// `redirect(` / `permanentRedirect(` / `notFound()` that a redirect stub or a `if (!profileId)
// redirect('/sign-in')` gate ends an anonymous request with. A page carrying one of these does not
// render for a crawler, so it is correctly private and not a gap.
//
// `getMyProfileId()` is deliberately NOT on this list, and that omission is the whole point. It is
// how a page reads the VIEWER, not how it walls itself: /market calls it to personalise a page it
// serves to everyone. Treating it as a guard made this scan green over /market — the exact route it
// was written to watch — on the first fail-proof run. The signal has to be the stop, not the lookup.
const PAGE_GUARD =
  /\brequire(?:Admin|LeadFloor|Host|Auth|User|Member|Staff|Janitor)\s*\(|\bnotFound\s*\(\)|\bredirect\s*\(|\bpermanentRedirect\s*\(/

/** The `robots: { index: …, follow: … }` a page (or one of its layouts) declares, or null. */
export function robotsDirective(src) {
  const m = stripComments(src).match(/robots\s*:\s*\{([^}]*)\}/)
  if (!m) return null
  const read = (k) => {
    const v = m[1].match(new RegExp(`${k}\\s*:\\s*(true|false)`))
    return v ? v[1] === 'true' : null
  }
  return { index: read('index'), follow: read('follow') }
}

/** Every layout.tsx from app/ down to the page's own directory, nearest last. A layout's metadata
 *  is inherited, so a subtree noindexed at the top (app/(main)/pages/layout.tsx) is declared. */
export function layoutChain(file, exists = existsSync) {
  const out = []
  let dir = dirname(file)
  while (dir && dir !== '.' && dir.startsWith(APP_DIR)) {
    for (const name of ['layout.tsx', 'layout.ts']) {
      const p = join(dir, name)
      if (exists(p)) out.push(p)
    }
    const next = dirname(dir)
    if (next === dir) break
    dir = next
  }
  return out.reverse()
}

// ── Scans ───────────────────────────────────────────────────────────────────

/**
 * SCAN D — DOUBLE-BRANDED TITLE.
 *
 * `app/layout.tsx` sets `title.template: '%s · Frequency'`, so Next.js appends the site name to
 * every page's own `title`. A page that ALSO writes it produces "Name · Frequency · Frequency" in
 * the tab, in the SERP, and in every share card that falls back to <title>. `/spotlight/[handle]`
 * shipped exactly that on every published Spotlight.
 *
 * The distinction that makes this checkable: the template applies ONLY to the top-level `title`.
 * `openGraph.title` and `twitter.title` get no template, so they SHOULD carry the brand, and most
 * of this repo's marketing pages correctly do. A flat grep cannot tell the two apart — it would
 * fail 14 files that are right. So walk brace depth and skip anything inside an `openGraph:` or
 * `twitter:` object.
 *
 * Returns the offending `title:` lines. Exported for the unit tests.
 */
export function doubleBrandedTitles(src, siteName) {
  const code = stripComments(src)
  const out = []
  // Depth at which an openGraph:/twitter: object opened, or null when we are outside one.
  let depth = 0
  let socialDepth = null
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '{') {
      const before = code.slice(Math.max(0, i - 40), i)
      if (socialDepth === null && /\b(?:openGraph|twitter)\s*:\s*$/.test(before)) socialDepth = depth
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      if (socialDepth !== null && depth <= socialDepth) socialDepth = null
      continue
    }
    if (socialDepth !== null) continue
    if (!code.startsWith('title:', i)) continue
    // Only a string we can read: a quoted literal or a template literal. A template counts,
    // because `${name} · Frequency` is the Spotlight bug verbatim — the name is computed, the
    // suffix is not. A call expression (`buildTitle(name)`) is not decidable from source, and
    // guessing is worse than staying quiet: the point of this file is checks that mean what
    // they say.
    const m = /^title:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(code.slice(i))
    if (!m) { i += 5; continue }
    if (m[2].includes(`· ${siteName}`) || m[2].includes(`- ${siteName}`)) {
      out.push({ line: code.slice(0, i).split('\n').length, title: m[2] })
    }
    i += m[0].length - 1
  }
  return out
}

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

  // ── Scan C: DECLARATION — every crawler-reachable page outside (marketing) says what it wants. ──
  const privatePrefixes = [...new Set([...parsePathList(ROBOTS_FILE, 'DISALLOW'), ...parsePathList(PROXY_FILE, 'PROTECTED_PATHS')])]
  const declarationChecked = []
  const noindexed = []
  let skippedPrivate = 0
  for (const file of allFiles) {
    if (!/[/\\]page\.(tsx?|jsx?)$/.test(file)) continue
    if (file.startsWith(MARKETING_DIR + sep) || file.startsWith(MARKETING_DIR + '/')) continue // Scan A owns these
    const route = normalize(routeForFile(file))
    if (isDynamic(route) || route === '/') continue // dynamic pages are registry/DB-driven; '/' is Scan A

    const src = readFileSync(file, 'utf8')
    // A page's declaration can live on the page OR on any layout above it (metadata is inherited).
    const directive =
      robotsDirective(src) ?? layoutChain(file).map((l) => robotsDirective(readFileSync(l, 'utf8'))).filter(Boolean).pop() ?? null
    const noindex = directive?.index === false
    const isAdvertised = advertised.has(route)

    if (noindex && isAdvertised) {
      failures.push({
        kind: 'CONTRADICTION',
        detail: `${relative('.', file)} → ${route} declares robots.index=false but sitemap.ts advertises it — we are submitting a URL we tell crawlers not to index`,
      })
      continue
    }
    if (isAdvertised) { declarationChecked.push(route); continue }
    if (noindex) {
      declarationChecked.push(route)
      noindexed.push(`${route} (noindex, ${directive.follow === false ? 'nofollow' : 'follow'})`)
      continue
    }
    if (isPrivateRoute(route, privatePrefixes) || PAGE_GUARD.test(stripComments(src))) { skippedPrivate += 1; continue }

    failures.push({
      kind: 'UNDECLARED ROUTE',
      detail: `${relative('.', file)} → ${route} is crawler-reachable (not robots-disallowed, not proxy-protected, no auth guard) but is neither advertised in sitemap.ts nor noindexed — the crawler decides`,
    })
  }

  // ── Scan D: a page title that re-appends the site name the root template already adds. ──
  let titlesChecked = 0
  const brand = siteName(readFile(SITE_FILE))
  if (!brand) {
    failures.push({
      kind: 'SITE NAME UNREADABLE',
      detail: `could not read SITE_NAME from ${SITE_FILE} — Scan D (double-branded titles) cannot run, and a scan that silently checks nothing is worse than one that fails`,
    })
  }
  for (const file of brand ? allFiles.filter((f) => f.endsWith('page.tsx')) : []) {
    titlesChecked += 1
    for (const hit of doubleBrandedTitles(readFile(file) ?? '', brand)) {
      failures.push({
        kind: 'DOUBLE-BRANDED TITLE',
        detail: `${relative('.', file)}:${hit.line} → title "${hit.title}" already ends in the site name, and app/layout.tsx's title.template appends it again ("… · ${brand} · ${brand}"). Drop the suffix. (openGraph.title / twitter.title correctly keep it — they get no template.)`,
      })
    }
  }

  return { failures, warnings, coverageChecked, resolutionChecked, declarationChecked, noindexed, skippedPrivate, titlesChecked }
}

function main() {
  const { failures, warnings, coverageChecked, resolutionChecked, declarationChecked, noindexed, skippedPrivate, titlesChecked } = run()

  console.log(
    `SEO/sitemap coherence — checked ${coverageChecked.length} forward-facing page(s) for coverage, ` +
      `${resolutionChecked.length} literal sitemap route(s) for resolution, and ${declarationChecked.length} ` +
      `crawler-reachable page(s) outside (marketing) for a declaration (${skippedPrivate} correctly-private page(s) skipped), ` +
      `and ${titlesChecked} page title(s) for double-branding.`,
  )
  if (noindexed.length > 0) {
    console.log(`  ${noindexed.length} reachable page(s) consciously kept OUT of the index:`)
    for (const n of noindexed.sort()) console.log(`      ${n}`)
  }

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
      '  every literal sitemap route resolves to a real page, and every crawler-reachable page\n' +
      '  outside (marketing) declares its intent (advertised, or noindex), and no page title\n' +
      '  re-appends the site name the root title.template already adds.',
  )
}

// Only run the CLI when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}

export { run, routeForFile, sitemapLiteralRoutes, INTENTIONALLY_EXCLUDED }
