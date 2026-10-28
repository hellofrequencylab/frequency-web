import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  space: { status: 'active', visibility: 'network', type: 'business' } as
    | { status: string; visibility: string | null; type: string }
    | null,
  spaceError: null as { message: string } | null,
  dispatchAutomations: vi.fn(),
  recordSpaceCtaClick: vi.fn(async (_spaceId: string, _actorId: string | null, _nonce: string) => {
    mocks.dispatchAutomations()
  }),
  getMyProfileId: vi.fn(async () => 'viewer-1' as string | null),
  rateLimitOk: vi.fn(async () => true),
  claimOnce: vi.fn(async () => true),
}))

vi.mock('@/lib/spaces/analytics', () => ({ recordSpaceCtaClick: mocks.recordSpaceCtaClick }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: mocks.rateLimitOk, claimOnce: mocks.claimOnce }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '192.0.2.10' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'spaces') throw new Error(`unexpected table ${table}`)
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mocks.space, error: mocks.spaceError }),
      }
      return query
    },
  }),
}))

import { recordSpaceCtaClickAction } from './analytics-actions'
import { createSpaceCtaClickToken } from './cta-click-token'

const tokenFor = (spaceId = 'space-1') => {
  const token = createSpaceCtaClickToken(spaceId, 'session')
  if (!token) throw new Error('test token was not created')
  return token
}

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = 'test-secret-for-space-cta-clicks'
  mocks.space = { status: 'active', visibility: 'network', type: 'business' }
  mocks.spaceError = null
  mocks.dispatchAutomations.mockClear()
  mocks.recordSpaceCtaClick.mockClear()
  mocks.getMyProfileId.mockClear()
  mocks.rateLimitOk.mockReset().mockResolvedValue(true)
  mocks.claimOnce.mockReset().mockResolvedValue(true)
})

describe('recordSpaceCtaClickAction', () => {
  it('records a valid server-issued proof and carries its nonce into the ledger key', async () => {
    const token = tokenFor()
    await recordSpaceCtaClickAction('space-1', token)

    expect(mocks.rateLimitOk).toHaveBeenCalledWith('space-cta-click', '192.0.2.10', 60, '60 s')
    expect(mocks.claimOnce).toHaveBeenCalledWith(expect.stringMatching(/^space-cta-click:/), 600)
    expect(mocks.recordSpaceCtaClick).toHaveBeenCalledWith('space-1', 'viewer-1', expect.any(String))
    expect(mocks.dispatchAutomations).toHaveBeenCalledTimes(1)
  })

  it('rejects replayed proof without recording or dispatching automations', async () => {
    mocks.claimOnce.mockResolvedValue(false)
    await recordSpaceCtaClickAction('space-1', tokenFor())

    expect(mocks.recordSpaceCtaClick).not.toHaveBeenCalled()
    expect(mocks.dispatchAutomations).not.toHaveBeenCalled()
  })

  it('rejects a proof presented for an altered Space before any lookup or side effect', async () => {
    await recordSpaceCtaClickAction('space-2', tokenFor('space-1'))

    expect(mocks.rateLimitOk).not.toHaveBeenCalled()
    expect(mocks.recordSpaceCtaClick).not.toHaveBeenCalled()
    expect(mocks.dispatchAutomations).not.toHaveBeenCalled()
  })

  it.each([
    ['private', { status: 'active', visibility: 'private', type: 'business' }],
    ['inactive', { status: 'suspended', visibility: 'network', type: 'business' }],
    ['platform root', { status: 'active', visibility: 'network', type: 'root' }],
    ['missing', null],
  ])('rejects a %s Space without recording or dispatching automations', async (_label, space) => {
    mocks.space = space
    await recordSpaceCtaClickAction('space-1', tokenFor())

    expect(mocks.recordSpaceCtaClick).not.toHaveBeenCalled()
    expect(mocks.dispatchAutomations).not.toHaveBeenCalled()
  })

  it('rejects throttled clicks without recording or dispatching automations', async () => {
    mocks.rateLimitOk.mockResolvedValue(false)
    await recordSpaceCtaClickAction('space-1', tokenFor())

    expect(mocks.claimOnce).not.toHaveBeenCalled()
    expect(mocks.recordSpaceCtaClick).not.toHaveBeenCalled()
    expect(mocks.dispatchAutomations).not.toHaveBeenCalled()
  })

  it('rejects malformed or tampered proof without recording or dispatching automations', async () => {
    const token = tokenFor()
    await recordSpaceCtaClickAction('space-1', `${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`)

    expect(mocks.recordSpaceCtaClick).not.toHaveBeenCalled()
    expect(mocks.dispatchAutomations).not.toHaveBeenCalled()
  })
})
