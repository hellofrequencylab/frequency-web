import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DIRECT_LINKS,
  FEATURE_FALLBACK,
  FEATURE_JOURNEYS,
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  ROUTES,
  SEARCH_INDEX,
  SIDE_CTA,
  WING_MENUS,
  featureHref,
  searchSite,
} from '@/lib/frequency/site-nav'
import { DEFAULT_PAGE, SITE_PAGES, moodStyle, resolveSitePage } from '@/lib/frequency/site-pages'

// Every route app/ serves, as segment patterns: route groups dropped, [param] matches any segment.
function appRoutes(): string[][] {
  const out: string[][] = []
  const walk = (dir: string, segs: string[]) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name.startsWith('_') || e.name.startsWith('@')) continue
        const seg = /^\(.*\)$/.test(e.name) ? null : e.name
        walk(path.join(dir, e.name), seg ? [...segs, seg] : segs)
      } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name)) out.push(segs)
    }
  }
  walk(path.join(process.cwd(), 'app'), [])
  return out
}
const ROUTE_PATTERNS = appRoutes()

// Catch-alls are left out: app/(main)/[...catchAll] would otherwise "resolve" every href, and a link
// that only a catch-all answers is a link to a not-found page.
function resolves(href: string): boolean {
  const segs = href.split('#')[0].split('?')[0].split('/').filter(Boolean)
  return ROUTE_PATTERNS.some(
    (pat) =>
      !pat.some((p) => p.includes('...')) &&
      pat.length === segs.length &&
      pat.every((p, i) => p.startsWith('[') || p === segs[i]),
  )
}

const everyHref = (): string[] =>
  [
    ...Object.values(ROUTES),
    ...Object.values(FEATURE_FALLBACK),
    ...FEATURE_JOURNEYS.flatMap((s) => s.jobs.flatMap((j) => j.features.map((f) => featureHref(f.id)))),
    ...WING_MENUS.flatMap((m) => [...m.cols.flatMap((c) => c.links.map((l) => l.href)), ...m.cards.map((c) => c.href), m.foot.cta.href]),
    ...DIRECT_LINKS.map((l) => l.href),
    ...SEARCH_INDEX.map((l) => l.href),
    ...FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)),
    ...FOOTER_LEGAL.map((l) => l.href),
    ...Object.values(SIDE_CTA).map((l) => l.href),
    ...Object.keys(SITE_PAGES),
  ].filter((h): h is string => typeof h === 'string')

describe('the Frequency site nav lands on real routes', () => {
  it('found the app routes (so the check below is not vacuous)', () => {
    expect(ROUTE_PATTERNS.length).toBeGreaterThan(50)
    expect(resolves('/spaces')).toBe(true)
    expect(resolves('/definitely-not-a-route')).toBe(false)
  })

  it('every link the header, sheet, search and footer can draw is a route app/ serves', () => {
    const dead = [...new Set(everyHref())].filter((h) => !resolves(h))
    expect(dead).toEqual([])
  })

  it('every help article it points at exists (the [category]/[slug] route answers any slug)', () => {
    const missing = [...new Set(everyHref())]
      .map((h) => /^\/help\/([^/#]+)\/([^/#]+)/.exec(h))
      .filter((m): m is RegExpExecArray => !!m)
      .filter((m) => !existsSync(path.join(process.cwd(), 'content/help', m[1], `${m[2]}.md`)))
      .map((m) => m[0])
    expect(missing).toEqual([])
  })

  it('every feature in the Features menu has somewhere to go', () => {
    for (const s of FEATURE_JOURNEYS) for (const j of s.jobs) for (const f of j.features) expect(FEATURE_FALLBACK[f.id], f.id).toBeTruthy()
  })
})

describe('the copy follows guidelines/messaging.md', () => {
  const words = JSON.stringify({ WING_MENUS, FEATURE_JOURNEYS, SEARCH_INDEX, FOOTER_COLUMNS, DIRECT_LINKS })
  it('never promises "every week" or "weekly"', () => {
    expect(words).not.toMatch(/every week|weekly/i)
  })
  it('calls the town calendar "What’s happening", never "What’s on"', () => {
    expect(words).toContain('What’s happening')
    expect(words).not.toMatch(/What['’]s on\b/)
  })
})

describe('search behaves like megamenu.js', () => {
  it('shows the first nine when empty and filters label + hint by substring', () => {
    expect(searchSite('')).toHaveLength(9)
    expect(searchSite('door').map((r) => r.label)).toContain('Door QR')
    expect(searchSite('for spaces · get paid').map((r) => r.label)).toEqual(['Tickets + refunds', 'Memberships', 'Tips'])
    expect(searchSite('zzzz')).toEqual([])
  })
})

describe('the page table', () => {
  it('only the front door leaves the side unlocked', () => {
    expect(Object.entries(SITE_PAGES).filter(([, p]) => !p.locked).map(([r]) => r)).toEqual(['/'])
  })
  it('resolves exact routes, section prefixes and the default', () => {
    expect(resolveSitePage('/').mood).toBe('home')
    expect(resolveSitePage('/spaces/').side).toBe('e')
    expect(resolveSitePage('/pricing/anything').mood).toBe('pricing')
    expect(resolveSitePage('/about')).toBe(DEFAULT_PAGE)
  })
  it('writes the mood hues as kit variables, never raw colours', () => {
    expect(moodStyle(resolveSitePage('/'))).toEqual({
      '--fq-m1': 'var(--fq-x-magenta-neon)',
      '--fq-m2': 'var(--fq-x-aqua-neon)',
      '--fq-m3': 'var(--fq-x-sun-neon)',
    })
  })
})
