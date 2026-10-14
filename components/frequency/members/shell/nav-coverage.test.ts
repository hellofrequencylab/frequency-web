import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as fqNav from './nav'
import { ACCESS_LEVELS, NAV_AREAS, type NavAccess } from '@/lib/nav-areas'
import { calmSpine, footerColumns, nodesForSurface, profileSections } from '@/lib/nav/registry'
import { personalRows } from '@/lib/nav/my-frequency-rows'
import type { MyFrequency } from '@/lib/nav/my-frequency'
import { SITE_MAP, websiteLinks } from '@/components/frequency/members/site-map/site-map-body'

// THE NAV COVERAGE GUARD (owner, 2026-10-13: "look at the live site and add all the links in
// appropriate places"). The live site runs DAWN; the Frequency member shell replaces its chrome. A
// destination the DAWN chrome links a member to must stay reachable from the Frequency chrome, or the
// swap quietly deletes a door. This file:
//
//   1. collects every member-facing destination the DAWN chrome links to, from the modules' exported
//      DATA (the rail's NAV_AREAS, the registry's account menu / member footer / phone spine, My
//      Frequency's rows), plus a short list of literal hrefs in the shell's JSX, each checked against
//      its source file so the list cannot rot;
//   2. collects every href the Frequency shell's nav.ts exports, GENERICALLY: every exported array or
//      object is walked and every `*href` / `*Href` string counted, so a new menu export (an account
//      menu, a rail-foot menu) counts the day it lands, with no edit here;
//   3. asserts (1) is inside (2), less a commented ALLOWLIST (deliberately not in the Frequency
//      chrome) and PENDING_NAV_MERGE (missing today, being added by the shell's nav change);
//   4. asserts every nav.ts href and every site-map href is a route app/ serves;
//   5. asserts the site map (/site-map) lists the same set, gated no looser than the menu row.
//
// Normalising: query and hash dropped; the viewer's own profile (`{profile}`, /profile,
// /people/<handle>) is one destination; the front door with or without `?home` is `/`. Entity pages
// (one event, one Circle) are content, not chrome, and are not collected.

// ── Routes ────────────────────────────────────────────────────────────────────────────────────
// The same resolver lib/frequency/site-nav.test.ts uses: every app/ page as segment patterns, route
// groups dropped, [param] matching any one segment, catch-alls excluded (a link only a catch-all
// answers is a link to a not-found page).
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

function resolves(href: string): boolean {
  const target = href === PROFILE ? '/profile' : href
  const segs = target.split('#')[0].split('?')[0].split('/').filter(Boolean)
  return ROUTE_PATTERNS.some(
    (pat) =>
      !pat.some((p) => p.includes('...')) &&
      pat.length === segs.length &&
      pat.every((p, i) => p.startsWith('[') || p === segs[i]),
  )
}

// ── Normalising ───────────────────────────────────────────────────────────────────────────────
const PROFILE = '{profile}'

/** Hrefs the DAWN chrome draws that next.config.ts redirects; the destination is what a member lands on. */
const REDIRECTED: Readonly<Record<string, string>> = {
  '/settings/notifications': '/settings', // -> /settings#notifications
}

function norm(href: string): string {
  if (href === PROFILE) return PROFILE
  const stripped = href.split('#')[0].split('?')[0] || '/'
  const bare = REDIRECTED[stripped] ?? stripped
  if (bare === '/profile' || /^\/people\/(\[[^\]]+\]|\$\{[^}]+\})$/.test(bare)) return PROFILE
  return bare.length > 1 ? bare.replace(/\/$/, '') : bare
}

// ── 1. The DAWN chrome's destinations ─────────────────────────────────────────────────────────
type Gate = { minAccess: NavAccess; staffDomain?: string }
type Dest = { href: string; gate: Gate; from: string }

/** Literal hrefs drawn in the DAWN shell's JSX (no exported data behind them). `snippet` must appear
 *  verbatim in `file`, so a link removed from the shell drops out of this list loudly. */
const DAWN_LITERALS: readonly { href: string; file: string; snippet: string; gate?: Gate }[] = [
  // Phone drawer foot (app-shell.tsx MobileDrawer).
  { href: '/about', file: 'components/layout/app-shell.tsx', snippet: 'href="/about"' },
  { href: '/what-is-frequency', file: 'components/layout/app-shell.tsx', snippet: 'href="/what-is-frequency"' },
  { href: '/terms', file: 'components/layout/app-shell.tsx', snippet: 'href="/terms"' },
  { href: '/guidelines', file: 'components/layout/app-shell.tsx', snippet: 'href="/guidelines"' },
  { href: '/privacy', file: 'components/layout/app-shell.tsx', snippet: 'href="/privacy"' },
  // Header: the brand mark, the Friends icon, the janitor Bug Alert pill.
  { href: '/feed', file: 'components/layout/app-shell.tsx', snippet: 'href="/feed"' },
  { href: '/network/friends', file: 'components/layout/app-shell.tsx', snippet: 'href="/network/friends"' },
  { href: '/admin/support', file: 'components/layout/app-shell.tsx', snippet: 'href="/admin/support"', gate: { minAccess: 'janitor' } },
  // Header search overlay's "see all results".
  { href: '/search', file: 'components/search/search-overlay.tsx', snippet: 'href={`/search?q=' },
  // Account menu chrome: View profile (UserMenu) and Appearance.
  { href: PROFILE, file: 'components/layout/user-menu.tsx', snippet: 'href={`/people/${profile.handle}`}' },
  { href: '/settings#appearance', file: 'components/layout/app-shell-account.tsx', snippet: 'href="/settings#appearance"' },
  // Right sidebar panels' "See all" doors and the game dock.
  { href: '/events', file: 'components/sidebar/rail-panels.tsx', snippet: 'href="/events"' },
  { href: '/people', file: 'components/sidebar/rail-panels.tsx', snippet: 'href="/people"', gate: { minAccess: 'member' } },
  { href: '/nearby', file: 'components/sidebar/rail-panels.tsx', snippet: 'href="/nearby"' },
  { href: '/crew/leaderboard', file: 'components/sidebar/rail-panels.tsx', snippet: 'href="/crew/leaderboard"', gate: { minAccess: 'member' } },
  { href: '/circles', file: 'components/sidebar/rail-panels.tsx', snippet: 'href="/circles"' },
  { href: '/practices', file: 'components/sidebar/game-stats-dock.tsx', snippet: 'href="/practices"' },
  { href: '/crew', file: 'components/sidebar/game-stats-dock.tsx', snippet: 'href="/crew"' },
  { href: '/crew/store', file: 'components/sidebar/game-stats-dock.tsx', snippet: 'href="/crew/store"' },
]

function dawnDestinations(): Dest[] {
  const out: Dest[] = []
  // The left rail (every declared area, railHidden ones too: they are drawn by My Frequency / ⌘K).
  for (const a of NAV_AREAS) {
    out.push({
      href: a.href,
      gate: { minAccess: a.defaultAccess, ...(a.staffDomain ? { staffDomain: a.staffDomain } : {}) },
      from: `rail:${a.key}`,
    })
  }
  // The account menu, and the account seeds that moved to another dock but kept ⌘K (Drafts).
  for (const s of profileSections()) {
    for (const n of s.nodes) out.push({ href: n.href, gate: n.gate as Gate, from: `account:${s.label}` })
  }
  for (const n of nodesForSurface('palette').filter((n) => n.id.startsWith('profile:'))) {
    out.push({ href: n.href, gate: n.gate as Gate, from: `account-palette:${n.id}` })
  }
  // The member sitemap footer.
  for (const c of footerColumns()) {
    for (const n of c.links) out.push({ href: n.href, gate: n.gate as Gate, from: `footer:${c.title}` })
  }
  // The phone bar.
  for (const t of calmSpine()) out.push({ href: t.node.href, gate: t.node.gate as Gate, from: 'phone-bar' })
  // My Frequency's fixed rows (its Spaces and Circles are the member's own entities, not chrome).
  const mf = { profileHref: PROFILE, drafts: 0, spaces: [], circles: [], total: 0 } satisfies MyFrequency
  for (const r of personalRows(mf)) out.push({ href: r.href, gate: { minAccess: 'member' }, from: `my-frequency:${r.key}` })
  for (const l of DAWN_LITERALS) out.push({ href: l.href, gate: l.gate ?? { minAccess: 'visitor' }, from: `literal:${l.file}` })
  return out
}

const rank = (a: NavAccess) => ACCESS_LEVELS.indexOf(a)

/** Normalised destination → the LOOSEST gate any DAWN surface draws it with. */
function dawnSet(): Map<string, Dest> {
  const map = new Map<string, Dest>()
  for (const d of dawnDestinations()) {
    const key = norm(d.href)
    const prev = map.get(key)
    if (!prev || rank(d.gate.minAccess) < rank(prev.gate.minAccess)) map.set(key, { ...d, href: key })
  }
  return map
}

// ── 2. The Frequency shell's hrefs, read generically from nav.ts ──────────────────────────────
function collectHrefs(value: unknown, key: string, out: Set<string>, seen: Set<unknown>) {
  if (typeof value === 'string') {
    if (/href$/i.test(key)) out.add(value)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) for (const v of value) collectHrefs(v, key, out, seen)
  else for (const [k, v] of Object.entries(value)) collectHrefs(v, k, out, seen)
}

function frequencyHrefs(): Set<string> {
  const raw = new Set<string>()
  const seen = new Set<unknown>()
  for (const [name, value] of Object.entries(fqNav)) {
    if (typeof value === 'function') continue
    // A top-level string export counts when its NAME says it is an href (FEED_HREF, MEMBER_HOME_HREF).
    collectHrefs(value, name, raw, seen)
  }
  return raw
}

// ── 3. The exceptions ─────────────────────────────────────────────────────────────────────────

/** Destinations the DAWN chrome draws that the Frequency chrome deliberately does not. One line each. */
const ALLOWLIST: Readonly<Record<string, string>> = {
  // An alert, not a menu row: the janitor-only red pill drawn only while support tickets are open.
  // The queue itself is an operator tool reached from the Admin world.
  '/admin/support': 'conditional janitor Bug Alert pill, not navigation',
}

/** MISSING from the Frequency shell today. The shell's nav change (account menu, rail-foot menu, the
 *  live-site links) is adding these; the coordinator empties this list when it merges. Not the
 *  allowlist: an entry here is a bug being fixed, not a decision. */
const PENDING_NAV_MERGE: readonly string[] = [
  // Rail
  '/network/contacts',
  '/housing',
  '/store',
  '/drafts',
  // Rail Admin section (staff / host+ only)
  '/admin',
  '/admin/community',
  '/lead',
  '/admin/programs',
  '/admin/growth',
  '/admin/crm',
  '/admin/vera-ai',
  '/admin/operations',
  '/admin/qr',
  '/admin/library',
  '/admin/spaces',
  '/admin/marketplace',
  // Account menu
  '/settings/billing',
  '/market/manage',
  '/network/friends',
  '/entry-points',
  // Member footer and drawer foot
  '/classifieds',
  '/market',
  '/people',
  '/about',
  '/the-lab',
  '/the-quest',
  '/vs',
  '/what-is-frequency',
  '/privacy',
  '/terms',
  '/guidelines',
]

// ── The checks ────────────────────────────────────────────────────────────────────────────────
const DAWN = dawnSet()
const FQ_RAW = frequencyHrefs()
const FQ = new Set([...FQ_RAW].map(norm))

describe('the nav coverage guard reads real data', () => {
  it('found the routes, the DAWN chrome and the Frequency nav (so nothing below is vacuous)', () => {
    expect(ROUTE_PATTERNS.length).toBeGreaterThan(50)
    expect(resolves('/definitely-not-a-route')).toBe(false)
    expect(DAWN.size).toBeGreaterThan(30)
    expect(FQ.has('/circles') && FQ.has('/feed') && FQ.has(PROFILE)).toBe(true)
  })

  it('every literal DAWN href is still drawn by the file it names', () => {
    const stale = DAWN_LITERALS.filter((l) => !readFileSync(path.join(process.cwd(), l.file), 'utf8').includes(l.snippet))
    expect(stale.map((l) => `${l.file}: ${l.snippet}`)).toEqual([])
  })

  it('the exception lists name real DAWN destinations, once each', () => {
    const listed = [...Object.keys(ALLOWLIST), ...PENDING_NAV_MERGE]
    expect(listed.filter((h) => !DAWN.has(h))).toEqual([])
    expect(listed.length).toBe(new Set(listed).size)
  })
})

describe('the Frequency chrome reaches every DAWN destination', () => {
  it('nothing the live chrome links to is missing (outside the allowlist and the pending list)', () => {
    const missing = [...DAWN.keys()].filter((h) => !FQ.has(h) && !(h in ALLOWLIST) && !PENDING_NAV_MERGE.includes(h))
    expect(missing).toEqual([])
  })

  it('PENDING_NAV_MERGE holds only what is still missing (empty it as the shell catches up)', () => {
    expect(PENDING_NAV_MERGE.filter((h) => FQ.has(h))).toEqual([])
  })

  it('every href nav.ts exports is a route app/ serves', () => {
    expect([...FQ_RAW].filter((h) => !resolves(h))).toEqual([])
  })
})

describe('the site map lists the same set', () => {
  const links = [...SITE_MAP.flatMap((c) => c.links), ...websiteLinks('dawn')]
  const mapped = new Map(links.map((l) => [norm(l.href), l]))

  it('every DAWN destination has a place on /site-map (the allowlisted alert aside)', () => {
    expect([...DAWN.keys()].filter((h) => !mapped.has(h) && !(h in ALLOWLIST))).toEqual([])
  })

  it('every Frequency menu destination has a place on the Frequency /site-map too', () => {
    const fqMapped = new Set([...mapped.keys(), ...websiteLinks('frequency').map((l) => norm(l.href))])
    expect([...FQ].filter((h) => !fqMapped.has(h))).toEqual([])
  })

  it('a link a menu gates above member is gated no looser on the map (staff rows only for staff)', () => {
    const loose = [...DAWN.values()]
      .filter((d) => rank(d.gate.minAccess) > rank('member'))
      .filter((d) => {
        const l = mapped.get(d.href)
        if (!l) return false
        return !l.gate || rank(l.gate.minAccess) < rank(d.gate.minAccess) || l.gate.staffDomain !== d.gate.staffDomain
      })
      .map((d) => d.href)
    expect(loose).toEqual([])
  })

  it('every site-map link is a route app/ serves', () => {
    const dawnLinks = links.filter((l) => !resolves(l.href)).map((l) => l.href)
    const fqLinks = websiteLinks('frequency').filter((l) => !resolves(l.href)).map((l) => l.href)
    expect([...dawnLinks, ...fqLinks]).toEqual([])
  })

  it('the DAWN website row leaves out the Frequency-only pages (a DAWN build answers 404 there)', () => {
    const dawn = websiteLinks('dawn').map((l) => l.href)
    for (const h of ['/features', '/stories', '/vision']) expect(dawn).not.toContain(h)
  })
})
