import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-743 (2026-10-05): the claim-on-join block used to live only in completeOnboarding, whose
// page redirects to /join, so the live finisher never ran it. It is now one helper both finishers
// call. This pins what the helper does with a profile, an email and the session client: the four
// legs run, each leg is fail-safe, and the grab cookie is cleared from the one slot it came from.

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  deleted: [] as string[],
  claimPendingLeadGrab: vi.fn(),
  claimLeadOnSignup: vi.fn(),
  rewardConnectorJoinOnSignup: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.jar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    delete: (name: string) => {
      mocks.deleted.push(name)
      mocks.jar.delete(name)
    },
  }),
}))
vi.mock('@/lib/rewards/connector', () => ({ rewardConnectorJoinOnSignup: mocks.rewardConnectorJoinOnSignup }))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead_grab',
  LEGACY_LEAD_GRAB_COOKIE: 'fq_lead',
  // A grab cookie is URL-encoded JSON; the signup lead claim's cookie is `<id>.<token>` and
  // parses to nothing, which is why the two can share a jar during the fallback window.
  parseLeadGrab: (value?: string) => (value && value.startsWith('%7B') ? { s: 'space-1', d: 'space_qr' } : null),
  claimPendingLeadGrab: mocks.claimPendingLeadGrab,
  claimLeadOnSignup: mocks.claimLeadOnSignup,
}))

import { runClaimOnJoin } from './claim-on-join'

const session = { rpc: mocks.rpc }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.jar.clear()
  mocks.deleted.length = 0
  mocks.claimPendingLeadGrab.mockResolvedValue('contact-1')
  mocks.claimLeadOnSignup.mockResolvedValue(undefined)
  mocks.rewardConnectorJoinOnSignup.mockResolvedValue(undefined)
  mocks.rpc.mockResolvedValue({ data: null, error: null })
})

describe('runClaimOnJoin', () => {
  it('claims the sealed lead, the guest seats and the connector reward for a plain signup', async () => {
    await runClaimOnJoin('p1', 'sam@test.local', session)
    expect(mocks.claimPendingLeadGrab).not.toHaveBeenCalled()
    expect(mocks.claimLeadOnSignup).toHaveBeenCalledWith('p1', 'sam@test.local')
    expect(mocks.rpc).toHaveBeenCalledWith('claim_guest_rsvps', { p_profile_id: 'p1' })
    expect(mocks.rewardConnectorJoinOnSignup).toHaveBeenCalledWith('sam@test.local')
  })

  it('redeems a Space lead-grab from the current cookie and clears only that slot', async () => {
    mocks.jar.set('fq_lead_grab', '%7B%22s%22%3A%22space-1%22%7D')
    mocks.jar.set('fq_lead', 'lead-9.tok-9')
    await runClaimOnJoin('p1', 'sam@test.local', session)
    expect(mocks.claimPendingLeadGrab).toHaveBeenCalledWith('p1', { s: 'space-1', d: 'space_qr' })
    expect(mocks.deleted).toEqual(['fq_lead_grab'])
    expect(mocks.jar.get('fq_lead')).toBe('lead-9.tok-9')
  })

  it('still redeems a grab parked under the old name', async () => {
    mocks.jar.set('fq_lead', '%7B%22s%22%3A%22space-1%22%7D')
    await runClaimOnJoin('p1', 'sam@test.local', session)
    expect(mocks.claimPendingLeadGrab).toHaveBeenCalledWith('p1', { s: 'space-1', d: 'space_qr' })
    expect(mocks.deleted).toEqual(['fq_lead'])
  })

  it('leaves the signup lead claim cookie alone: it shares the old name but is not a grab', async () => {
    mocks.jar.set('fq_lead', 'lead-9.tok-9')
    await runClaimOnJoin('p1', 'sam@test.local', session)
    expect(mocks.claimPendingLeadGrab).not.toHaveBeenCalled()
    expect(mocks.deleted).toEqual([])
  })

  it('every leg is fail-safe: one leg failing never stops the next or throws', async () => {
    mocks.jar.set('fq_lead_grab', '%7B%22s%22%3A%22space-1%22%7D')
    mocks.claimPendingLeadGrab.mockRejectedValue(new Error('crm down'))
    mocks.claimLeadOnSignup.mockRejectedValue(new Error('touchpoint down'))
    mocks.rpc.mockRejectedValue(new Error('rpc down'))
    mocks.rewardConnectorJoinOnSignup.mockRejectedValue(new Error('grants down'))
    await expect(runClaimOnJoin('p1', 'sam@test.local', session)).resolves.toBeUndefined()
    expect(mocks.claimLeadOnSignup).toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalled()
    expect(mocks.rewardConnectorJoinOnSignup).toHaveBeenCalled()
  })

  it('does nothing without a profile id', async () => {
    await runClaimOnJoin('', 'sam@test.local', session)
    expect(mocks.claimLeadOnSignup).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.rewardConnectorJoinOnSignup).not.toHaveBeenCalled()
  })
})
