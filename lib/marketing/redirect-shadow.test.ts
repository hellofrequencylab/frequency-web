import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import nextConfig from '../../next.config'

// ── NO REDIRECT MAY SHADOW A LIVE ROUTE ──────────────────────────────────────────────────────────
//
// Redirects are evaluated BEFORE the filesystem router, so a rule whose `source` matches a real page
// does not merely overlap that page — it REPLACES it. Nothing else notices: the route file still
// exists, tsc is happy, every other test passes, and the page is simply unreachable in production.
//
// `funnel-redirects.test.ts` proved that failure mode is real, but it only guards `/for/<slug>`. This
// file generalises it to every rule against every route in `app/`, because HYG-043/HYG-044 (ADR-1199)
// moved 41 redirect-only route files into next.config and two of the new rules sit directly above
// live subtrees:
//
//   /spaces/:slug/settings           — 19 live sub-pages beneath it (basics, billing, members,
//                                      offerings, qr, email, shop, …). As `:path*` this rule would
//                                      take out an operator's entire settings console.
//   /spaces/:slug/settings/services  — a live `services/new/page.tsx` sibling.
//
// Both are written as EXACT sources. That is the whole safety argument, and until this file existed
// nothing checked it — a one-character edit adding `/:path*` would have shipped green.
//
// HOW IT WORKS. Each route file becomes a path pattern (`[slug]` → `:slug`, `[...x]` → `:x*`, route
// GROUPS like `(main)` and `(marketing)` contribute nothing to the URL). Each redirect source becomes
// a matcher. A rule shadows a route when its matcher accepts that route's path. Both sides are
// normalised to the same shape so the comparison is about URLs rather than about file layout.

type Redirect = { source: string; destination: string; permanent?: boolean }

async function redirects(): Promise<Redirect[]> {
  const fn = nextConfig.redirects
  if (typeof fn !== 'function') return []
  return (await fn.call(nextConfig)) as Redirect[]
}

/** Every routable path in `app/`, as a URL pattern. A route group `(main)` is not a URL segment. */
function liveRoutes(): string[] {
  const out: string[] = []
  const walk = (dir: string, url: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name.startsWith('_') || e.name === 'node_modules') continue
        const isGroup = e.name.startsWith('(') && e.name.endsWith(')')
        const seg = isGroup
          ? ''
          : e.name.startsWith('[...')
            ? `/:${e.name.slice(4, -1)}*`
            : e.name.startsWith('[')
              ? `/:${e.name.slice(1, -1)}`
              : `/${e.name}`
        walk(join(dir, e.name), url + seg)
      } else if (e.name === 'page.tsx' || e.name === 'route.ts') {
        out.push(url || '/')
      }
    }
  }
  walk('app', '')
  return out
}

/**
 * A redirect `source` as a regex over URL paths. Mirrors the subset of path-to-regexp Next uses.
 *
 * Parsed SEGMENT BY SEGMENT rather than by chained `.replace()` calls, and that is not a style
 * preference. The chained version fought itself twice in one sitting: `:path*` left the source's own
 * slash in front of `(?:/[^/]+)*` and matched nothing, and then the generic `:name` rule matched the
 * `?:` inside its own earlier output and produced `(?[^/]+|…)`, an invalid group. Both bugs made the
 * guard USELESS while looking fine, which for a shadow detector is the worst possible failure. A
 * parser cannot re-read what it has already written.
 */
function sourceMatcher(source: string): RegExp {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let body = ''
  for (const seg of source.split('/').filter(Boolean)) {
    const alt = /^:(\w+)\(([^)]*)\)$/.exec(seg)
    if (alt) {
      // :tab(events|journey|practice) — exactly one segment, from this set
      body += `/(?:${alt[2]!.split('|').map(esc).join('|')})`
    } else if (/^:\w+\*$/.test(seg)) {
      // :path* — zero or more segments, so it swallows everything beneath it. The dangerous one.
      body += '(?:/[^/]+)*'
    } else if (/^:\w+$/.test(seg)) {
      body += '/[^/]+'
    } else {
      body += `/${esc(seg)}`
    }
  }
  return new RegExp(`^${body || '/'}$`)
}

describe('a redirect never shadows a live route', () => {
  it('finds the routes and the rules at all (the detector is not silently empty)', async () => {
    expect(liveRoutes().length).toBeGreaterThan(200)
    expect((await redirects()).length).toBeGreaterThan(40)
  })

  it('no rule matches a route that still has a page', async () => {
    const routes = liveRoutes()
    const offenders: string[] = []
    for (const r of await redirects()) {
      const re = sourceMatcher(r.source)
      for (const route of routes) {
        // A rule is allowed to match its OWN destination's ancestors etc; only a live SOURCE is a bug.
        if (re.test(route)) offenders.push(`${r.source} shadows ${route}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // ── The two the purge created, pinned by name ────────────────────────────────────────────────
  // Named individually rather than left to the sweep above, because a future edit that widened one
  // of them would also delete the routes it shadows from `app/`, and the sweep would then pass. The
  // sweep catches a widening; these catch a widening plus a deletion, which is how it would really
  // happen.

  it('the Space settings rule is EXACT, because 19 live sub-pages sit under it', async () => {
    const rule = (await redirects()).find((r) => r.source === '/spaces/:slug/settings')
    expect(rule).toBeDefined()
    expect(rule!.destination).toBe('/spaces/:slug/manage')
    const wide = (await redirects()).filter((r) => r.source.startsWith('/spaces/:slug/settings/:'))
    expect(wide.map((r) => r.source)).toEqual([])
  })

  it('the Space services rule is EXACT, because services/new is a live page', async () => {
    const rules = await redirects()
    expect(rules.some((r) => r.source === '/spaces/:slug/settings/services')).toBe(true)
    expect(rules.some((r) => r.source === '/spaces/:slug/settings/services/:path*')).toBe(false)
  })

  it('the matcher itself discriminates, so the sweep above is not vacuous', () => {
    expect(sourceMatcher('/spaces/:slug/settings').test('/spaces/:slug/settings')).toBe(true)
    expect(sourceMatcher('/spaces/:slug/settings').test('/spaces/:slug/settings/billing')).toBe(false)
    // The shape that would have been a silent catastrophe:
    expect(sourceMatcher('/spaces/:slug/settings/:path*').test('/spaces/:slug/settings/billing')).toBe(true)
    expect(sourceMatcher('/circles/:slug/:tab(events|journey|practice)').test('/circles/:slug/events')).toBe(true)
    expect(sourceMatcher('/circles/:slug/:tab(events|journey|practice)').test('/circles/:slug/stats')).toBe(false)
  })
})

describe('the retired stubs really are gone, not merely redirected past', () => {
  // HYG-043's own probe counts the files; this states the consequence in the language of the change:
  // a rule exists for each retired path AND no page.tsx answers it any more. A consolidation is not
  // finished until the thing it replaced is deleted.
  const RETIRED = [
    '/how-it-works',
    '/practice',
    '/vault',
    '/connections/import',
    '/settings/account',
    '/spaces/:slug/settings/enroll',
  ]

  it('each retired path is served by a config rule', async () => {
    const sources = new Set((await redirects()).map((r) => r.source))
    expect(RETIRED.filter((p) => !sources.has(p))).toEqual([])
  })

  it('and none of them still has a route file', () => {
    const routes = new Set(liveRoutes())
    expect(RETIRED.filter((p) => routes.has(p))).toEqual([])
  })
})
