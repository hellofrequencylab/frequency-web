import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-696 (ADR-1676): the staff Activate door is where a money persona becomes a seller. It goes
// Active only when the member's Stripe Connect account can take charges, read fresh at the action
// (never trusted from the page), and activating binds that account id onto the persona row. A
// member without one is refused with the sentence that says where to add it.

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: async () => undefined }))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: async () => undefined }))
vi.mock('@/lib/trust', () => ({ trustSource: () => ({ signal: async () => undefined }) }))
// SCAN-761: suspending the last listing program takes the member's directory listing down.
const unpublish = { lost: false, hidden: [] as string[] }
vi.mock('@/lib/partners/unpublish', () => ({
  listingProgramLost: async () => unpublish.lost,
  hidePartnerListing: async (id: string) => {
    unpublish.hidden.push(id)
    return { slugs: ['blue-cafe'] }
  },
}))

const connect = { accountId: null as string | null, chargesEnabled: false }
const connectReads: string[] = []
vi.mock('@/lib/billing/connect', () => ({
  getConnectStatus: async (profileId: string) => {
    connectReads.push(profileId)
    return {
      accountId: connect.accountId,
      chargesEnabled: connect.chargesEnabled,
      payoutsEnabled: connect.chargesEnabled,
      detailsSubmitted: !!connect.accountId,
      onboarded: !!connect.accountId,
      ready: connect.chargesEnabled,
    }
  },
}))

// The persona row the action reads, and every patch it writes.
let current: { state: string } | null = { state: 'verified' }
const updates: Record<string, unknown>[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | null = null
      const api = {
        select: () => api,
        update: (p: Record<string, unknown>) => {
          patch = p
          return api
        },
        eq: () => api,
        maybeSingle: async () => ({ data: current, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (patch) updates.push(patch)
          return Promise.resolve(resolve({ data: null, error: null }))
        },
      }
      return api
    },
  }),
}))

import { transitionPersona } from './actions'
import { PERSONA_NEEDS_PAYOUT } from '@/lib/personas-core'

beforeEach(() => {
  current = { state: 'verified' }
  connect.accountId = null
  connect.chargesEnabled = false
  updates.length = 0
  connectReads.length = 0
  unpublish.lost = false
  unpublish.hidden.length = 0
})

describe('transitionPersona → suspended (SCAN-761)', () => {
  it('takes the listing down when the suspended program was the last listing program', async () => {
    unpublish.lost = true
    const r = await transitionPersona('member-1', 'business', 'suspended')
    expect(r).toEqual({ data: { state: 'suspended' } })
    expect(updates[0]).toEqual({ state: 'suspended' })
    expect(unpublish.hidden).toEqual(['member-1'])
  })

  it('does not touch the listing on any other move', async () => {
    unpublish.lost = true
    current = { state: 'claimed' }
    await transitionPersona('member-1', 'business', 'verified')
    expect(unpublish.hidden).toEqual([])
  })
})

describe('transitionPersona → active (LIVE-696)', () => {
  it('activates a money persona whose member can take charges, and binds that account', async () => {
    connect.accountId = 'acct_123'
    connect.chargesEnabled = true
    const r = await transitionPersona('member-1', 'practitioner', 'active')
    expect(r).toEqual({ data: { state: 'active' } })
    expect(connectReads).toEqual(['member-1'])
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ state: 'active', stripe_account_id: 'acct_123' })
  })

  it('refuses a money persona with no payout account, writes nothing, and says where to add one', async () => {
    const r = await transitionPersona('member-1', 'organization', 'active')
    expect(r).toEqual({ error: PERSONA_NEEDS_PAYOUT })
    expect(updates).toHaveLength(0)
  })

  it('refuses an account that exists but cannot take charges yet', async () => {
    connect.accountId = 'acct_123'
    const r = await transitionPersona('member-1', 'practitioner', 'active')
    expect(r).toEqual({ error: PERSONA_NEEDS_PAYOUT })
    expect(updates).toHaveLength(0)
  })

  it('activates a persona that takes no money without a payout account or a binding', async () => {
    const r = await transitionPersona('member-1', 'collaborator', 'active')
    expect(r).toEqual({ data: { state: 'active' } })
    expect(updates[0]).toEqual({ state: 'active' })
  })

  it('still follows the ladder: a bare claim cannot jump to active even with an account', async () => {
    current = { state: 'claimed' }
    connect.accountId = 'acct_123'
    connect.chargesEnabled = true
    const r = await transitionPersona('member-1', 'practitioner', 'active')
    expect('error' in r).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('does not read Connect for a move that is not activation', async () => {
    current = { state: 'claimed' }
    const r = await transitionPersona('member-1', 'practitioner', 'verified')
    expect(r).toEqual({ data: { state: 'verified' } })
    expect(connectReads).toEqual([])
  })
})
