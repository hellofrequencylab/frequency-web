import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'

// WHO IS CALLING /api/v1 (LIVE-715, ADR-1643): the bearer path and the cookie path, driven through
// the REAL authorizeCaller and the REAL lib/auth mapping. Only the network edges are doubled:
// Supabase Auth's GET /auth/v1/user (per client), the profiles read, and next/headers.
//
// The load-bearing assertion is the first one: a bearer caller and a cookie caller for the SAME
// profile row resolve to the SAME CallerProfile object getCallerProfile() gives the web. If a second
// mapping ever appears, that equality is what breaks.

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLTEifQ.c2lnbmF0dXJl'
const OTHER_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.Zm9yZ2Vk'

type Row = Record<string, unknown>

let row: Row | null
/** What Supabase Auth answers for a bearer token: a user id, or an error. */
let bearerAuth: { user: { id: string } | null; error: unknown }
/** The auth user behind the web cookie, or null when signed out. */
let cookieUser: { id: string } | null
let viewAsCookie: string | null
const calls = { bearerClients: [] as string[], bearerGetUser: [] as (string | undefined)[], cookieGetUser: 0, profileReads: [] as string[] }

function profilesTable(authUserId: string) {
  return {
    select: (cols: string) => ({
      eq: (col: string, v: string) => {
        expect(col).toBe('auth_user_id')
        calls.profileReads.push(cols)
        return { maybeSingle: async () => ({ data: v === authUserId ? row : null, error: null }) }
      },
    }),
  }
}

vi.mock('@/lib/supabase/bearer', () => ({
  createBearerClient: (token: string) => {
    calls.bearerClients.push(token)
    return {
      auth: {
        getUser: async (jwt?: string) => {
          calls.bearerGetUser.push(jwt)
          return bearerAuth.error
            ? { data: { user: null }, error: bearerAuth.error }
            : { data: { user: bearerAuth.user }, error: null }
        },
      },
      from: (table: string) => {
        expect(table).toBe('profiles')
        return profilesTable(bearerAuth.user?.id ?? '')
      },
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        calls.cookieGetUser += 1
        return { data: { user: cookieUser }, error: null }
      },
    },
    from: (table: string) => {
      expect(table).toBe('profiles')
      return profilesTable(cookieUser?.id ?? '')
    },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: (name: string) => (name === 'freq-view-as' && viewAsCookie ? { name, value: viewAsCookie } : undefined),
    set: () => {},
  }),
}))

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

function req(init: { method?: string; auth?: string; origin?: string; host?: string } = {}): Request {
  const headers = new Headers({ host: init.host ?? 'frequencylocal.com' })
  if (init.auth !== undefined) headers.set('authorization', init.auth)
  if (init.origin) headers.set('origin', init.origin)
  return new Request('https://frequencylocal.com/api/v1/me', { method: init.method ?? 'GET', headers })
}

async function load() {
  vi.resetModules()
  const caller = await import('./caller')
  const auth = await import('@/lib/auth')
  return { ...caller, auth }
}

beforeEach(() => {
  row = {
    id: 'p-1', display_name: 'Ada', handle: 'ada', avatar_url: 'https://cdn.example/ada.png',
    community_role: 'guide', community_level: 'guide', web_role: 'none', membership_tier: 'free',
    current_season_zaps: 3, lifetime_gems: 1, current_streak: 2, meta: null,
    home_lat: 1, home_lng: 2, feed_radius_m: 5000,
  }
  bearerAuth = { user: { id: 'auth-1' }, error: null }
  cookieUser = { id: 'auth-1' }
  viewAsCookie = null
  calls.bearerClients = []
  calls.bearerGetUser = []
  calls.cookieGetUser = 0
  calls.profileReads = []
})

describe('bearer and cookie resolve to the same caller the web uses', () => {
  it('a bearer caller and a cookie caller for the same row get the object getCallerProfile() returns', async () => {
    const { authorizeCaller, auth } = await load()
    const viaBearer = await authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))
    const viaCookie = await authorizeCaller(req())
    const web = await auth.getCallerProfile()
    expect(viaBearer.ok && viaBearer.via).toBe('bearer')
    expect(viaCookie.ok && viaCookie.via).toBe('cookie')
    if (!viaBearer.ok || !viaCookie.ok) throw new Error('both should resolve')
    expect(viaBearer.caller).toEqual(web)
    expect(viaCookie.caller).toEqual(web)
    expect(viaBearer.profile.handle).toBe('ada')
  })

  it('the bearer path verifies the token with Supabase Auth and reads the row with that token', async () => {
    const { authorizeCaller, auth } = await load()
    const result = await authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))
    expect(result.ok).toBe(true)
    expect(calls.bearerClients).toEqual([TOKEN])
    expect(calls.bearerGetUser).toEqual([TOKEN])
    expect(calls.profileReads).toEqual([auth.VIEWER_PROFILE_COLUMNS])
    // No cookie was consulted: the header decided.
    expect(calls.cookieGetUser).toBe(0)
  })

  it('the scheme is case-insensitive', async () => {
    const { authorizeCaller } = await load()
    const result = await authorizeCaller(req({ auth: `bearer ${TOKEN}` }))
    expect(result.ok && result.via).toBe('bearer')
  })

  it('view-as never applies to a bearer caller; it still previews on the cookie path', async () => {
    row = { ...row, community_role: 'mentor', community_level: 'mentor' }
    viewAsCookie = 'member'
    const { authorizeCaller } = await load()
    const viaBearer = await authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))
    const viaCookie = await authorizeCaller(req())
    expect(viaBearer.ok && viaBearer.caller.community_role).toBe('mentor')
    expect(viaCookie.ok && viaCookie.caller.community_role).toBe('member')
  })
})

describe('bearer refusals', () => {
  it.each([
    ['a forged token', new AuthApiError('invalid JWT: unable to parse or verify signature', 403, 'bad_jwt')],
    ['an expired token', new AuthApiError('token is expired', 403, 'bad_jwt')],
    ['a revoked session', new AuthApiError('Session from session_id claim in JWT does not exist', 403, 'session_not_found')],
    ['a deleted user', new AuthApiError('User from sub claim in JWT does not exist', 404, 'user_not_found')],
  ])('%s is 401 unauthorized and reads no profile', async (_label, error) => {
    bearerAuth = { user: null, error }
    const { authorizeCaller } = await load()
    const result = await authorizeCaller(req({ auth: `Bearer ${OTHER_TOKEN}` }))
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(calls.profileReads).toEqual([])
  })

  it.each([
    ['no token', 'Bearer '],
    ['not a JWT', 'Bearer not-a-token'],
    ['another scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['two tokens', `Bearer ${TOKEN} ${TOKEN}`],
    ['an oversized token', `Bearer ${'a'.repeat(5000)}.${'b'.repeat(4000)}.c`],
  ])('a malformed header (%s) is 401 without a round trip to Auth', async (_label, header) => {
    const { authorizeCaller } = await load()
    const result = await authorizeCaller(req({ auth: header }))
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(calls.bearerGetUser).toEqual([])
  })

  it('a bad bearer token does NOT fall back to a valid cookie', async () => {
    bearerAuth = { user: null, error: new AuthApiError('invalid JWT', 403, 'bad_jwt') }
    cookieUser = { id: 'auth-1' }
    const { authorizeCaller } = await load()
    const result = await authorizeCaller(req({ auth: `Bearer ${OTHER_TOKEN}` }))
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(calls.cookieGetUser).toBe(0)
  })

  it('an Auth outage is internal, not a sign-out', async () => {
    bearerAuth = { user: null, error: new AuthRetryableFetchError('fetch failed', 0) }
    const { authorizeCaller } = await load()
    expect(await authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))).toMatchObject({ ok: false, code: 'internal' })
    bearerAuth = { user: null, error: new AuthApiError('upstream', 502, 'unexpected_failure') }
    const again = await (await load()).authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))
    expect(again).toMatchObject({ ok: false, code: 'internal' })
  })

  it('a valid token with no profile row is profile_required', async () => {
    row = null
    const { authorizeCaller } = await load()
    expect(await authorizeCaller(req({ auth: `Bearer ${TOKEN}` }))).toMatchObject({ ok: false, code: 'profile_required' })
  })
})

describe('the cookie path', () => {
  it('signed out is 401 unauthorized', async () => {
    cookieUser = null
    const { authorizeCaller } = await load()
    expect(await authorizeCaller(req())).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  it('signed in without a profile is profile_required', async () => {
    row = null
    const { authorizeCaller } = await load()
    expect(await authorizeCaller(req())).toMatchObject({ ok: false, code: 'profile_required' })
  })

  it('a cookie write from another origin is forbidden (CSRF), from this site it passes', async () => {
    const { authorizeCaller } = await load()
    expect(await authorizeCaller(req({ method: 'POST', origin: 'https://evil.example' }))).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await authorizeCaller(req({ method: 'POST' }))).toMatchObject({ ok: false, code: 'forbidden' })
    const same = await authorizeCaller(req({ method: 'POST', origin: 'https://frequencylocal.com' }))
    expect(same.ok && same.via).toBe('cookie')
  })

  it('a bearer write needs no Origin: nothing attaches a bearer token on a person’s behalf', async () => {
    const { authorizeCaller } = await load()
    const result = await authorizeCaller(req({ method: 'POST', auth: `Bearer ${TOKEN}`, origin: 'https://elsewhere.example' }))
    expect(result.ok && result.via).toBe('bearer')
  })
})

describe('readBearer', () => {
  it('reads nothing when the header is absent or blank, so the cookie decides', async () => {
    const { readBearer } = await load()
    expect(readBearer(null)).toBeNull()
    expect(readBearer('   ')).toBeNull()
  })
})
