import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionBootstrapResponse } from '@/lib/contract'

// POST /api/v1/session/bootstrap (LIVE-718): the native sign-in runs the web's post-sign-in step
// with the caller's own (bearer) session client.

let authOk = true
const claims = vi.fn(async (_client: unknown, _id: string) => ({ seatLanding: '/events/live-now', orderLanding: null }))
const tracked = vi.fn(async () => {})

vi.mock('@/lib/contract/caller', async () => {
  const { runAsBearer } = await import('@/lib/supabase/request-identity')
  return {
    authorizeCaller: async () =>
      authOk
        ? { ok: true, via: 'bearer', caller: { id: 'p-1', community_role: 'member', communityLevel: 'member', webRole: 'none', membershipTier: 'free' }, profile: { handle: 'ada', display_name: 'Ada', avatar_url: null }, identity: { token: 'tok', user: { id: 'auth-1' } } }
        : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
    asCaller: (auth: { identity?: never }, fn: () => Promise<unknown>) => (auth.identity ? runAsBearer(auth.identity, fn) : fn()),
    toMeView: () => ({ id: 'p-1', handle: 'ada', displayName: 'Ada', avatarUrl: null, communityRole: 'member', communityLevel: 'member', webRole: 'none', membershipTier: 'free', auth: 'bearer' }),
  }
})
vi.mock('@/lib/auth/post-sign-in', () => ({ runPostSignInClaims: claims }))
vi.mock('@/lib/supabase/server', async () => {
  const { bearerIdentity } = await import('@/lib/supabase/request-identity')
  return { createClient: async () => ({ client: bearerIdentity() ? `bearer:${bearerIdentity()!.token}` : 'cookie' }) }
})
vi.mock('@/lib/analytics/track', () => ({ track: tracked }))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))

beforeEach(() => {
  authOk = true
  claims.mockClear()
  tracked.mockClear()
})

describe('POST /api/v1/session/bootstrap', () => {
  it('runs the four claims with the bearer session client and returns the landing', async () => {
    const { POST } = await import('./route')
    const res = await POST(new Request('https://frequencylocal.com/api/v1/session/bootstrap', { method: 'POST' }))
    const json = await res.json()
    expect(sessionBootstrapResponse.safeParse(json).success, JSON.stringify(json)).toBe(true)
    expect(claims).toHaveBeenCalledWith({ client: 'bearer:tok' }, 'p-1')
    expect(json.data).toMatchObject({ seatLanding: '/events/live-now', orderLanding: null, me: { id: 'p-1' } })
    expect(tracked).toHaveBeenCalledWith('account.created', { source: 'app' }, 'p-1', { idempotencyKey: 'account.created:p-1' })
  })

  it('is a 401 signed out and claims nothing', async () => {
    authOk = false
    const { POST } = await import('./route')
    expect((await POST(new Request('https://frequencylocal.com/api/v1/session/bootstrap', { method: 'POST' }))).status).toBe(401)
    expect(claims).not.toHaveBeenCalled()
  })
})
