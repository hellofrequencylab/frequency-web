import { describe, it, expect, vi, beforeEach } from 'vitest'

// completeOnboarding (scan2 L6-09): the identity columns go in the checked update (handle
// uniqueness decides that outcome); `onboarding_completed` is then merged server-side as its own
// key, so beta / tour state is preserved without being read and written back. A merge that fails
// throws before any welcome side effect runs.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  redirect: vi.fn(),
  applyReferralAttribution: vi.fn(),
  postWelcomeForMember: vi.fn(),
  recordConsent: vi.fn(),
  cur: {} as Record<string, unknown>,
  updates: [] as unknown[],
}))

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1', email: 'sam@test.local' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.cur, error: null }) }) }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/email', () => ({ sendWelcomeEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/consent/consent', () => ({ recordConsent: mocks.recordConsent }))
vi.mock('@/lib/qr/referral', () => ({
  applyReferralAttribution: mocks.applyReferralAttribution,
  applyEntryPointConversion: vi.fn(async () => undefined),
}))
vi.mock('@/lib/onboarding/welcome', () => ({ postWelcomeForMember: mocks.postWelcomeForMember }))
vi.mock('@/lib/qr/member-codes', () => ({ ensureMemberCodes: vi.fn(async () => undefined) }))
vi.mock('@/lib/attribution/acquisition', () => ({ persistAcquisition: vi.fn(async () => undefined) }))
vi.mock('@/lib/rewards/connector', () => ({ rewardConnectorJoinOnSignup: vi.fn(async () => undefined) }))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead',
  parseLeadGrab: () => null,
  claimPendingLeadGrab: vi.fn(async () => undefined),
  claimLeadOnSignup: vi.fn(async () => undefined),
}))

import { completeOnboarding } from './actions'

const input = { displayName: 'Sam', handle: 'sam', bio: '', avatarUrl: '', regionId: 'r1', emailOptIn: true }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.applyReferralAttribution.mockResolvedValue(undefined)
  mocks.postWelcomeForMember.mockResolvedValue(undefined)
  mocks.recordConsent.mockResolvedValue(undefined)
  mocks.cur = { display_name: null, handle: null, bio: null, avatar_url: null, nexus_region_id: null, meta: { beta: { intent: 'x' }, tour: { seen: ['a'] } } }
})

describe('completeOnboarding', () => {
  it('writes the identity columns WITHOUT meta, then merges only onboarding_completed', async () => {
    await completeOnboarding(input)
    expect(mocks.updates).toHaveLength(1)
    const cols = mocks.updates[0] as Record<string, unknown>
    expect('meta' in cols).toBe(false)
    expect(cols).toMatchObject({ display_name: 'Sam', handle: 'sam', nexus_region_id: 'r1' })
    const merge = mocks.rpc.mock.calls.find((c) => c[0] === 'merge_profile_meta') as [string, Record<string, unknown>]
    expect(merge[1]).toEqual({ p_profile_id: 'p1', p_patch: { onboarding_completed: true } })
    expect(mocks.applyReferralAttribution).toHaveBeenCalledWith('p1')
    expect(mocks.redirect).toHaveBeenCalledWith('/feed?welcome=vera')
  })

  it('throws before any welcome side effect when the merge did not land', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'merge_profile_meta' ? { data: null, error: { message: 'boom' } } : { data: null, error: null },
    )
    await expect(completeOnboarding(input)).rejects.toThrow('boom')
    expect(mocks.applyReferralAttribution).not.toHaveBeenCalled()
    expect(mocks.postWelcomeForMember).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
