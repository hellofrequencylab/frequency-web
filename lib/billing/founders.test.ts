import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// FOUNDERS ROUND GRANT (grantFounderFromSession). The grant-on-success logic, the single
// write point shared by the webhook branch and the success-page confirm action. Locked here:
//   1. A paid founders session sets profiles.is_founding_member=true and records the tier
//      (in meta.founder.tier).
//   2. ONLY the Founding Member tier locks a price (locked_price_id); supporter/patron do not.
//   3. A non-founders / unpaid session is a clean NO-OP (no write, returns null).
//   4. IDEMPOTENT: re-running writes the same fixed values, so a webhook + confirm race (or a
//      Stripe retry) grants the founding membership exactly to the same end state.
// The DB is mocked: createAdminClient().from('profiles') captures the update patch.

const { profilesUpdate, profilesMaybeSingle } = vi.hoisted(() => ({
  profilesUpdate: vi.fn(),
  profilesMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: profilesMaybeSingle }) }),
        update: (patch: unknown) => {
          profilesUpdate(patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }),
}))

import { grantFounderFromSession } from './founders'

function paidFounderSession(tier: string, overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    payment_status: 'paid',
    client_reference_id: 'profile-1',
    metadata: { kind: 'founders', founder_tier: tier, profile_id: 'profile-1' },
    payment_intent: 'pi_123',
    line_items: { data: [{ price: { id: 'price_member_onetime' } }] },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

beforeEach(() => {
  vi.clearAllMocks()
  profilesMaybeSingle.mockResolvedValue({ data: { meta: {} } })
})

describe('grantFounderFromSession - grant correctness', () => {
  it('member: sets is_founding_member, records the tier, locks the charged price for life', async () => {
    const tier = await grantFounderFromSession(paidFounderSession('member'))
    expect(tier).toBe('member')
    expect(profilesUpdate).toHaveBeenCalledTimes(1)
    const patch = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(patch.is_founding_member).toBe(true)
    expect(patch.locked_price_id).toBe('price_member_onetime')
    const founder = (patch.meta as { founder: { tier: string; founder_round: boolean } }).founder
    expect(founder.tier).toBe('member')
    expect(founder.founder_round).toBe(true)
  })

  it('supporter: sets is_founding_member + tier but does NOT lock a price', async () => {
    const tier = await grantFounderFromSession(paidFounderSession('supporter'))
    expect(tier).toBe('supporter')
    const patch = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(patch.is_founding_member).toBe(true)
    expect('locked_price_id' in patch).toBe(false)
    expect((patch.meta as { founder: { tier: string } }).founder.tier).toBe('supporter')
  })

  it('patron: founding member, no price lock', async () => {
    const tier = await grantFounderFromSession(paidFounderSession('patron'))
    expect(tier).toBe('patron')
    const patch = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(patch.is_founding_member).toBe(true)
    expect('locked_price_id' in patch).toBe(false)
  })

  it('member: does NOT lock a price when no line item price is present (never stores a PaymentIntent id)', async () => {
    // Webhook path: the session isn't expanded with line_items, so there is no PRICE id to lock.
    // We must leave locked_price_id unset (NOT fall back to the pi_… PaymentIntent id, which is not
    // a price and would poison resolveMemberPriceId). The confirm action later sets the real price.
    const session = paidFounderSession('member', { line_items: undefined })
    await grantFounderFromSession(session)
    const patch = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect('locked_price_id' in patch).toBe(false)
    expect(patch.is_founding_member).toBe(true)
  })

  it('preserves existing meta.founder sub-keys when merging', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: { meta: { founder: { rewarded: ['a'] }, other: 1 } } })
    await grantFounderFromSession(paidFounderSession('member'))
    const patch = profilesUpdate.mock.calls[0][0] as { meta: Record<string, unknown> }
    expect(patch.meta.other).toBe(1)
    const founder = patch.meta.founder as { rewarded: string[]; tier: string }
    expect(founder.rewarded).toEqual(['a'])
    expect(founder.tier).toBe('member')
  })
})

describe('grantFounderFromSession - no-op guards', () => {
  it('ignores a non-founders session (different kind) and writes nothing', async () => {
    const session = paidFounderSession('member', { metadata: { kind: 'tip', founder_tier: 'member', profile_id: 'profile-1' } })
    const tier = await grantFounderFromSession(session)
    expect(tier).toBeNull()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('ignores an unpaid session and writes nothing', async () => {
    const session = paidFounderSession('member', { payment_status: 'unpaid' })
    const tier = await grantFounderFromSession(session)
    expect(tier).toBeNull()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('ignores an unknown founder tier (default-deny) and writes nothing', async () => {
    const session = paidFounderSession('gold')
    const tier = await grantFounderFromSession(session)
    expect(tier).toBeNull()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('ignores a session with no profile id and writes nothing', async () => {
    const session = paidFounderSession('member', {
      client_reference_id: null,
      metadata: { kind: 'founders', founder_tier: 'member' },
    })
    const tier = await grantFounderFromSession(session)
    expect(tier).toBeNull()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })
})

describe('grantFounderFromSession - idempotency', () => {
  it('re-running writes the same fixed end state (safe for a webhook + confirm race)', async () => {
    const session = paidFounderSession('member')
    await grantFounderFromSession(session)
    const first = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    profilesUpdate.mockClear()
    // Second run (e.g. webhook after the confirm already granted): same fixed values.
    await grantFounderFromSession(session)
    const second = profilesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(second.is_founding_member).toBe(first.is_founding_member)
    expect(second.locked_price_id).toBe(first.locked_price_id)
    expect((second.meta as { founder: { tier: string } }).founder.tier).toBe('member')
  })
})
