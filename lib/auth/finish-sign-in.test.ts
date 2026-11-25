import { describe, it, expect, vi, beforeEach } from 'vitest'

// SEC-045: a password sign-in never visits /auth/callback, so it runs the same steps here.
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/ga-client-id', () => ({ readGaIdentity: vi.fn(async () => null) }))
const runGuestClaims = vi.fn(async () => null as string | null)
const claimOrders = vi.fn(async () => null as string | null)
vi.mock('@/lib/auth/post-sign-in', () => ({ runGuestClaims: (...a: unknown[]) => runGuestClaims(...(a as [])) }))
vi.mock('@/lib/commerce/claim-guest-orders-on-sign-in', () => ({ claimGuestOrdersOnSignIn: () => claimOrders() }))

const { finishSignIn } = await import('./finish-sign-in')
const { track } = await import('@/lib/analytics/track')

function client(user: Record<string, unknown> | null, profileId: string | null = 'p1') {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileId ? { id: profileId } : null }) }) }) }),
  }
}

describe('finishSignIn', () => {
  beforeEach(() => {
    runGuestClaims.mockReset().mockResolvedValue(null)
    claimOrders.mockReset().mockResolvedValue(null)
  })

  it('runs the claims and the ledger row, and writes a password hint', async () => {
    const out = await finishSignIn(client({ id: 'u', email: 'meg@gmail.com' }), null)
    expect(runGuestClaims).toHaveBeenCalledOnce()
    expect(claimOrders).toHaveBeenCalledOnce()
    expect(track).toHaveBeenCalledWith('account.created', { source: 'password' }, 'p1', expect.objectContaining({ idempotencyKey: 'account.created:p1' }))
    expect(out).toEqual({ destination: '/feed', hint: 'password|m•••@gmail.com' })
  })

  it('an asked-for destination beats every recovery', async () => {
    runGuestClaims.mockResolvedValue('/events/live')
    expect((await finishSignIn(client({ id: 'u', email: 'a@b.co' }), '/spaces/x')).destination).toBe('/spaces/x')
  })

  it('seat, then welcome, then funnel fill the default', async () => {
    runGuestClaims.mockResolvedValue('/events/live')
    claimOrders.mockResolvedValue('/journeys/j/welcome')
    expect((await finishSignIn(client({ id: 'u', email: 'a@b.co' }), null)).destination).toBe('/events/live')
    runGuestClaims.mockResolvedValue(null)
    expect((await finishSignIn(client({ id: 'u', email: 'a@b.co' }), null)).destination).toBe('/journeys/j/welcome')
  })

  it('refuses an off-site next and an unknown funnel', async () => {
    const out = await finishSignIn(client({ id: 'u', email: 'a@b.co', user_metadata: { funnel_seq: '../evil' } }), '//evil.com')
    expect(out.destination).toBe('/feed')
  })

  it('never throws on the login path', async () => {
    const broken = { auth: { getUser: async () => { throw new Error('down') } }, from: () => null }
    await expect(finishSignIn(broken, null)).resolves.toEqual({ destination: '/feed', hint: null })
  })
})
