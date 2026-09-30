import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthApiError } from '@supabase/supabase-js'
import { meResponse } from '@/lib/contract'

// GET /api/v1/me end to end through the real route, the real authorizeCaller and the real
// envelope (LIVE-715, ADR-1643). The doubles are the network edges only: Supabase Auth and the
// profiles read for each client, and the rate limiter's Redis.

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdXRoLTEifQ.c2lnbmF0dXJl'

let bearerError: unknown = null
let cookieUser: { id: string } | null = null
let limiterAllows = true

const ROW = {
  id: 'p-1', display_name: 'Ada', handle: 'ada', avatar_url: null,
  community_role: 'host', community_level: 'host', web_role: 'none', membership_tier: 'free',
  current_season_zaps: 0, lifetime_gems: 0, current_streak: 0, meta: null,
  home_lat: null, home_lng: null, feed_radius_m: null,
}

const profiles = {
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ROW, error: null }) }) }),
}

vi.mock('@/lib/supabase/bearer', () => ({
  createBearerClient: () => ({
    auth: {
      getUser: async () => (bearerError ? { data: { user: null }, error: bearerError } : { data: { user: { id: 'auth-1' } }, error: null }),
    },
    from: () => profiles,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: cookieUser }, error: null }) },
    from: () => profiles,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
}))

vi.mock('@/lib/rate-limit', () => ({
  clientIp: () => '203.0.113.9',
  rateLimitOk: vi.fn(async () => limiterAllows),
}))

async function call(headers: Record<string, string> = {}) {
  vi.resetModules()
  const { GET } = await import('./route')
  const res = await GET(new Request('https://frequencylocal.com/api/v1/me', { headers }))
  const body = await res.json()
  expect(meResponse.safeParse(body).success, JSON.stringify(body)).toBe(true)
  return { res, body }
}

beforeEach(() => {
  bearerError = null
  cookieUser = null
  limiterAllows = true
})

describe('GET /api/v1/me', () => {
  it('answers a bearer caller with their profile summary in the envelope', async () => {
    const { res, body } = await call({ authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(200)
    expect(res.headers.get('Frequency-Contract')).toBe('1')
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(body.error).toBeNull()
    expect(body.data).toMatchObject({ id: 'p-1', handle: 'ada', displayName: 'Ada', communityRole: 'host', communityLevel: 'host', auth: 'bearer' })
  })

  it('still answers the web cookie session', async () => {
    cookieUser = { id: 'auth-1' }
    const { res, body } = await call()
    expect(res.status).toBe(200)
    expect(body.data.auth).toBe('cookie')
    expect(body.data.id).toBe('p-1')
  })

  it('refuses an expired bearer token with 401 unauthorized', async () => {
    bearerError = new AuthApiError('token is expired', 403, 'bad_jwt')
    const { res, body } = await call({ authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(401)
    expect(body).toMatchObject({ data: null, error: { code: 'unauthorized' } })
  })

  it('refuses a request with no credential at all', async () => {
    const { res, body } = await call()
    expect(res.status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
  })

  it('answers 429 rate_limited with Retry-After before checking any credential', async () => {
    limiterAllows = false
    const { res, body } = await call({ authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(body.error.code).toBe('rate_limited')
  })
})
