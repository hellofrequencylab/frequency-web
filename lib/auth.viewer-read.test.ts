import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ONE VIEWER READ PER REQUEST (LIVE-178, ADR-1244).
//
// `supabase.auth.getUser()` is not a local JWT decode: @supabase/auth-js issues GET /auth/v1/user
// whenever a session exists. Until 2026-09-07 a signed-in feed load made that call four times in
// series (proxy, (main) layout, lib/auth getCachedUser from inside the layout wave, feed page) and
// read the viewer's own `profiles` row three times, plus a fourth by id for the geo columns. React
// `cache()` deduped only what went THROUGH lib/auth; the layout and the page each built their own
// client beside it.
//
// Two halves, because each catches what the other cannot:
//   1. SOURCE SHAPE. A second `auth.getUser()` in the layout compiles, returns the right user and
//      costs a round trip on every member page forever; tsc, eslint and a render test all pass.
//      So this reads the three files and counts the sites, and it checks the shared select still
//      carries every column the layout and the feed read from the row (a dropped column would
//      silently default an onboarding gate or a geo radius).
//   2. BEHAVIOUR. With a memoising `cache` stand-in, every identity helper in lib/auth must share
//      one getUser and one profiles select, and a view-as downgrade must still leave `realRole`
//      true, because the layout gates the view-as control on the real role and the resolver hands
//      out the effective one (hazard 2 of the row: the two must not collapse).
//
// The proxy (proxy.ts) is NOT counted. It runs before the render in a different runtime, its
// getUser is what refreshes the session cookie, and nothing here forwards its identity into the
// render as a header (hazard 3: a trusted inbound identity header is an auth bypass, not a
// speed-up). The render always verifies the cookie itself, once.

const AUTH = 'lib/auth.ts'
const LAYOUT = 'app/(main)/layout.tsx'
const FEED = 'app/(main)/feed/page.tsx'

/** Strip comment lines so a count cannot be satisfied by the documentation above the code. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

function count(src: string, re: RegExp): number {
  return src.match(re)?.length ?? 0
}

const auth = code(AUTH)
const layout = code(LAYOUT)
const feed = code(FEED)

describe('lib/auth is the one place a render verifies the viewer', () => {
  it('makes exactly one auth.getUser() and one profiles read', () => {
    expect(count(auth, /\.auth\.getUser\(\)/g)).toBe(1)
    expect(count(auth, /\.from\('profiles'\)/g)).toBe(1)
  })

  it('exports the shared row reader and its single-quoted column list', () => {
    expect(auth).toMatch(/export const getCachedViewerProfile = cache\(/)
    expect(auth).toMatch(/export const VIEWER_PROFILE_COLUMNS =\s*'[^']+'/)
    expect(auth).toMatch(/\.select\(VIEWER_PROFILE_COLUMNS\)/)
    // The resolver reads the shared row rather than selecting its own.
    expect(auth).toMatch(/const data = await getCachedViewerProfile\(\)/)
  })
})

describe('the (main) layout and the feed page read the viewer through lib/auth', () => {
  it('the layout builds no client of its own for the viewer', () => {
    expect(count(layout, /\.auth\.getUser\(\)/g)).toBe(0)
    expect(count(layout, /\.from\('profiles'\)/g)).toBe(0)
    expect(layout).not.toMatch(/from '@\/lib\/supabase\/server'/)
    expect(layout).toMatch(/import \{[^}]*getCachedUser[^}]*\} from '@\/lib\/auth'/)
    expect(layout).toMatch(/import \{[^}]*getCachedViewerProfile[^}]*\} from '@\/lib\/auth'/)
    expect(layout).toMatch(/const user = await getCachedUser\(\)/)
    expect(layout).toMatch(/const profile = await getCachedViewerProfile\(\)/)
  })

  it('the layout still gates on the real role, derived from the shared row', () => {
    // Hazard 2 of the row: the layout wants realRole (to show the view-as control) and the
    // effective role (for the shell) as two values. Both survive the shared read.
    expect(layout).toMatch(/const realRole = \(profile\.community_role \?\? 'member'\) as CommunityRole/)
    expect(layout).toMatch(/applyViewAs\(realRole\)/)
  })

  it('the feed page makes no viewer read of its own, not even the geo one', () => {
    expect(count(feed, /\.auth\.getUser\(\)/g)).toBe(0)
    expect(count(feed, /\.from\('profiles'\)/g)).toBe(0)
    expect(feed).not.toMatch(/from '@\/lib\/supabase\/server'/)
    expect(feed).toMatch(/const profile = await getCachedViewerProfile\(\)/)
    // The geo columns ride on the shared row rather than a second select keyed by id.
    expect(feed).toMatch(/profile\.home_lat/)
    expect(feed).toMatch(/profile\.feed_radius_m/)
  })

  it('the shared select carries every column the layout and the feed read', () => {
    const literal = readFileSync(AUTH, 'utf8').match(/VIEWER_PROFILE_COLUMNS =\s*'([^']+)'/)?.[1]
    expect(literal).toBeDefined()
    const cols = literal!.split(',').map((c) => c.trim())
    // What the layout read before 2026-09-07, plus what the resolver and the feed need.
    const needed = [
      'id', 'display_name', 'handle', 'avatar_url', 'community_role', 'community_level',
      'web_role', 'membership_tier', 'current_season_zaps', 'lifetime_gems', 'current_streak',
      'meta', 'home_lat', 'home_lng', 'feed_radius_m',
    ]
    for (const c of needed) expect(cols, `${c} left the shared select`).toContain(c)
    // Every `profile.<col>` the two consumers touch is a column the select carries.
    for (const src of [layout, feed]) {
      const used = new Set([...src.matchAll(/\bprofile\.([a-z_]+)/g)].map((m) => m[1]))
      for (const c of used) expect(cols, `${c} is read from the row but not selected`).toContain(c)
    }
  })
})

describe('page-level getUser sites under app/(main) are a ratchet', () => {
  // The layout fix removes the duplicate on EVERY member page. Pages that still verify the viewer
  // with their own client pay one extra round trip each; that set may shrink and never grow.
  // Measured 2026-09-07: 27 page.tsx files (28 before the feed page was routed through lib/auth).
  const CEILING = 27

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p, out)
      else if (entry.name === 'page.tsx') out.push(p)
    }
    return out
  }

  it(`no more than ${CEILING} member pages still build their own viewer read`, () => {
    const pages = walk('app/(main)').filter((p) => /\.auth\.getUser\(\)/.test(code(p)))
    expect(pages.length, `pages with their own auth.getUser(): ${pages.join(', ')}`).toBeLessThanOrEqual(CEILING)
  })
})

// ── Behaviour: one getUser, one select, two roles ─────────────────────────────────────────────

let getUserCalls = 0
let profileSelects: string[] = []
let viewAsCookie: string | null = null
let row: Record<string, unknown> | null = null

vi.mock('react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react')>()
  // React's `cache` is a per-request memo only inside a server render; outside one it is a
  // pass-through, so a plain call here would not prove sharing. This stand-in memoises like the
  // real one does during a render, which is exactly the property the count depends on.
  const cache = <T extends (...a: never[]) => unknown>(fn: T): T => {
    let hit = false
    let value: unknown
    return ((...args: never[]) => {
      if (!hit) {
        hit = true
        value = fn(...args)
      }
      return value
    }) as T
  }
  return { ...mod, cache }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: (name: string) => (name === 'freq-view-as' && viewAsCookie ? { name, value: viewAsCookie } : undefined),
    set: () => {},
  }),
}))

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        getUserCalls += 1
        return { data: { user: { id: 'auth-1' } }, error: null }
      },
    },
    from: (table: string) => {
      expect(table).toBe('profiles')
      return {
        select: (cols: string) => {
          profileSelects.push(cols)
          return {
            eq: (col: string, v: string) => {
              expect(col).toBe('auth_user_id')
              expect(v).toBe('auth-1')
              return { maybeSingle: async () => ({ data: row, error: null }) }
            },
          }
        },
      }
    },
  }),
}))

describe('every identity helper shares one verified user and one profiles select', () => {
  beforeEach(() => {
    vi.resetModules()
    getUserCalls = 0
    profileSelects = []
    viewAsCookie = null
    row = {
      id: 'p-1', display_name: 'Ada', handle: 'ada', avatar_url: null,
      community_role: 'mentor', community_level: 'mentor', web_role: 'janitor', membership_tier: 'crew',
      current_season_zaps: 3, lifetime_gems: 1, current_streak: 2, meta: null,
      home_lat: 1, home_lng: 2, feed_radius_m: 5000,
    }
  })

  it('layout + resolver + page helpers cost one getUser and one select', async () => {
    const a = await import('./auth')
    const [user, profile, caller, realRole, myId, staff, realWeb] = await Promise.all([
      a.getCachedUser(),
      a.getCachedViewerProfile(),
      a.getCallerProfile(),
      a.getRealCallerRole(),
      a.getMyProfileId(),
      a.isPlatformStaff(),
      a.getRealCallerWebRole(),
    ])
    expect(user?.id).toBe('auth-1')
    expect(profile?.id).toBe('p-1')
    expect(caller?.id).toBe('p-1')
    expect(realRole).toBe('mentor')
    expect(myId).toBe('p-1')
    expect(staff).toBe(true)
    expect(realWeb).toBe('janitor')
    expect(getUserCalls).toBe(1)
    expect(profileSelects).toEqual([a.VIEWER_PROFILE_COLUMNS])
  })

  it('a view-as downgrade changes the effective role and never the real one', async () => {
    viewAsCookie = 'member'
    const a = await import('./auth')
    const [caller, realRole, shared, staff] = await Promise.all([
      a.getCallerProfile(),
      a.getRealCallerRole(),
      a.getCachedViewerProfile(),
      a.isPlatformStaff(),
    ])
    expect(caller?.community_role).toBe('member')
    expect(caller?.webRole).toBe('none')
    expect(staff).toBe(false)
    expect(realRole).toBe('mentor')
    // The shared row is the raw DB value, which is what the layout derives realRole from.
    expect(shared?.community_role).toBe('mentor')
    expect(shared?.web_role).toBe('janitor')
    expect(getUserCalls).toBe(1)
    expect(profileSelects).toHaveLength(1)
  })

  it('a signed-in user with no row resolves to null without a second round trip', async () => {
    row = null
    const a = await import('./auth')
    const [shared, caller] = await Promise.all([a.getCachedViewerProfile(), a.getCallerProfile()])
    expect(shared).toBeNull()
    expect(caller).toBeNull()
    expect(getUserCalls).toBe(1)
    expect(profileSelects).toHaveLength(1)
  })
})
