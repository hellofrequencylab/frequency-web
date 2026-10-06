import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sourceWithoutComments } from '@/test/source-shape'

// CLAIM-ON-JOIN reaches the LIVE signup path (SCAN-743). The three claim calls (the Space lead-grab,
// the sealed lead's claim touchpoint, the connector join reward) plus the guest-seat RPC lived only in
// completeOnboarding, whose page redirects to /join, so every real signup dropped all of them. They now
// live in lib/onboarding/claim-on-join.ts and BOTH finishers call it.
//
// Two layers, in the house archetype: the helper is exercised behaviourally (its collaborators are
// mocked), and writeInduction is checked at source level (it fans out to a dozen server modules, so a
// behavioural harness there would be mostly mocks of things not under test).

const claimPendingLeadGrab = vi.fn()
const claimLeadOnSignup = vi.fn()
const rewardConnectorJoinOnSignup = vi.fn()
const cookieDelete = vi.fn()
let cookieValues: Record<string, string | undefined> = {}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues[name] === undefined ? undefined : { value: cookieValues[name] }),
    delete: (name: string) => cookieDelete(name),
  }),
}))
vi.mock('@/lib/rewards/connector', () => ({
  rewardConnectorJoinOnSignup: (e: unknown) => rewardConnectorJoinOnSignup(e),
}))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead_grab',
  LEGACY_LEAD_GRAB_COOKIE: 'fq_lead',
  // The real parser only accepts a grab payload; the signup claim cookie's `<id>.<token>` is not one.
  parseLeadGrab: (v: string | undefined) => (v && v.startsWith('grab:') ? { s: v.slice(5), d: 'qr' } : null),
  claimPendingLeadGrab: (p: unknown, g: unknown) => claimPendingLeadGrab(p, g),
  claimLeadOnSignup: (p: unknown, e: unknown) => claimLeadOnSignup(p, e),
}))

import { runClaimOnJoin } from '@/lib/onboarding/claim-on-join'

beforeEach(() => {
  vi.clearAllMocks()
  cookieValues = {}
  claimPendingLeadGrab.mockResolvedValue('contact-1')
  claimLeadOnSignup.mockResolvedValue(undefined)
  rewardConnectorJoinOnSignup.mockResolvedValue(undefined)
})

describe('runClaimOnJoin makes the three claim calls plus the guest-seat RPC', () => {
  it('claims the grab from the current cookie, the lead, the seats and the connector reward', async () => {
    cookieValues = { fq_lead_grab: 'grab:space-1', fq_lead: 'lead-id.token' }
    const rpc = vi.fn().mockResolvedValue({ error: null })

    await runClaimOnJoin('p1', 'new@example.com', { rpc })

    expect(claimPendingLeadGrab).toHaveBeenCalledWith('p1', { s: 'space-1', d: 'qr' })
    // Only the slot the grab came from is cleared; the signup claim cookie is markLeadConverted's.
    expect(cookieDelete).toHaveBeenCalledTimes(1)
    expect(cookieDelete).toHaveBeenCalledWith('fq_lead_grab')
    expect(claimLeadOnSignup).toHaveBeenCalledWith('p1', 'new@example.com')
    expect(rpc).toHaveBeenCalledWith('claim_guest_rsvps', { p_profile_id: 'p1' })
    expect(rewardConnectorJoinOnSignup).toHaveBeenCalledWith('new@example.com')
  })

  it('a visitor who only walked the join funnel claims no grab, but the other claims still run', async () => {
    cookieValues = { fq_lead: 'lead-id.token' }
    await runClaimOnJoin('p1', 'new@example.com', { rpc: vi.fn().mockResolvedValue(null) })
    expect(claimPendingLeadGrab).not.toHaveBeenCalled()
    expect(cookieDelete).not.toHaveBeenCalled()
    expect(claimLeadOnSignup).toHaveBeenCalledTimes(1)
    expect(rewardConnectorJoinOnSignup).toHaveBeenCalledTimes(1)
  })

  it('every step is fail-safe: one rejection never stops the next claim', async () => {
    cookieValues = { fq_lead_grab: 'grab:space-1' }
    claimPendingLeadGrab.mockRejectedValue(new Error('crm down'))
    claimLeadOnSignup.mockRejectedValue(new Error('lead down'))
    const rpc = vi.fn().mockRejectedValue(new Error('rpc down'))

    await expect(runClaimOnJoin('p1', 'new@example.com', { rpc })).resolves.toBeUndefined()
    expect(rewardConnectorJoinOnSignup).toHaveBeenCalledWith('new@example.com')
  })
})

describe('both signup finishers call the shared helper', () => {
  const join = sourceWithoutComments('app/join/(induction)/actions.ts', { imports: true })
  const legacy = sourceWithoutComments('app/onboarding/actions.ts', { imports: true })

  it('writeInduction runs it after acquisition is persisted and before the welcome is posted', () => {
    const start = join.indexOf('async function writeInduction')
    expect(start).toBeGreaterThan(-1)
    const body = join.slice(start)
    const persisted = body.indexOf('await persistAcquisition(')
    const claimed = body.indexOf('await runClaimOnJoin(')
    const welcomed = body.indexOf('postWelcomeForMember(')
    expect(persisted).toBeGreaterThan(-1)
    expect(claimed).toBeGreaterThan(persisted)
    expect(welcomed).toBeGreaterThan(claimed)
    // The session client goes in: the guest-seat RPC proves ownership with auth.uid().
    expect(body).toMatch(/runClaimOnJoin\(prof\.id as string, user\.email, supabase as unknown as ClaimOnJoinSession\)/)
  })

  it('completeOnboarding uses the same helper instead of its own copy of the block', () => {
    expect(legacy).toContain('await runClaimOnJoin(updated.id, user.email, supabase as unknown as ClaimOnJoinSession)')
    for (const needle of ['claimPendingLeadGrab(', 'claimLeadOnSignup(', 'rewardConnectorJoinOnSignup(', "rpc('claim_guest_rsvps'"]) {
      expect(legacy).not.toContain(needle)
    }
  })
})
