import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// THE SUBSCRIPTION RECEIPTS (lib/billing/subscription-receipt.ts, LIVE-344). Somebody starts paying
// every month and is told nothing. Locks:
//   1. A new paying Space member gets a receipt and the Space owner gets a bell plus an email.
//   2. A Space plan receipt names the plan and the price, and a TRIAL says billing has not started.
//   3. A member's own invoice receipt says "contribution" for Crew (docs/NAMING.md, ADR-1084) and
//      "payment" for anything else.
//   4. Every path degrades safely with no address and no Space, logs the miss, and never throws.
//   5. subscriptionPriceLabel sums every item, so a multi-item Space plan prints what is really paid.

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  accountEmails: new Map<string, string>(),
  profiles: new Map<string, { display_name: string | null }>(),
  spaces: new Map<string, Record<string, unknown>>(),
  tiers: new Map<string, { name: string | null }>(),
}))

// Only the SEND is stubbed. The receipt body is wrapped by the real `emailShell` (lib/email.ts),
// so what this file asserts about the rendered message is what a mailbox actually receives.
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async (id: string) => m.accountEmails.get(id) ?? null,
}))
vi.mock('./stripe', () => ({ appUrl: () => 'https://freq.test', stripe: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      const store =
        table === 'profiles'
          ? m.profiles
          : table === 'spaces'
            ? m.spaces
            : table === 'space_membership_tiers'
              ? m.tiers
              : null
      if (!store) throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => ({ data: (store as Map<string, unknown>).get(id) ?? null, error: null }),
          }),
        }),
      }
    },
  }),
}))

import {
  SPACE_MEMBER_PAID_NOTIFICATION_TYPE,
  sendMembershipInvoiceReceipt,
  sendSpaceMembershipReceipts,
  sendSpacePlanReceipt,
  subscriptionPriceLabel,
} from './subscription-receipt'

function sub(
  items: { unit: number | null; interval?: string; qty?: number }[],
  status = 'active',
): Stripe.Subscription {
  return {
    id: 'sub_1',
    status,
    items: {
      data: items.map((i) => ({
        quantity: i.qty ?? 1,
        price: { unit_amount: i.unit, currency: 'usd', recurring: { interval: i.interval ?? 'month' } },
      })),
    },
  } as unknown as Stripe.Subscription
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountEmails.clear()
  m.accountEmails.set('member-1', 'member@example.test')
  m.accountEmails.set('owner-1', 'owner@example.test')
  m.profiles.clear()
  m.profiles.set('member-1', { display_name: 'Ada Lovelace' })
  m.profiles.set('owner-1', { display_name: 'Grace Hopper' })
  m.spaces.clear()
  m.spaces.set('space-1', { owner_profile_id: 'owner-1', name: 'Blue Door', brand_name: null, slug: 'blue-door' })
  m.tiers.clear()
  m.tiers.set('tier-1', { name: 'Inner Ring' })
})

describe('subscriptionPriceLabel', () => {
  it('sums every item and says the interval', () => {
    expect(subscriptionPriceLabel(sub([{ unit: 1200 }]))).toBe('$12 a month')
    expect(subscriptionPriceLabel(sub([{ unit: 2900 }, { unit: 1000, qty: 3 }]))).toBe('$59 a month')
    expect(subscriptionPriceLabel(sub([{ unit: 29000, interval: 'year' }]))).toBe('$290 a year')
  })

  it('returns null rather than a wrong number when no item carries a price', () => {
    expect(subscriptionPriceLabel(sub([{ unit: null }]))).toBeNull()
    expect(subscriptionPriceLabel(sub([]))).toBeNull()
  })
})

describe('sendSpaceMembershipReceipts', () => {
  const opts = { spaceId: 'space-1', memberProfileId: 'member-1', tierId: 'tier-1', sub: sub([{ unit: 1200 }]) }

  it('receipts the member and tells the Space: two emails, one bell', async () => {
    await sendSpaceMembershipReceipts(opts)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(2)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)

    const member = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(member.to).toBe('member@example.test')
    expect(member.subject).toBe('Your Inner Ring membership at Blue Door')
    expect(member.text).toContain('$12 a month')
    expect(member.text).toContain('cancel')

    const owner = m.enqueueEmail.mock.calls[1][0] as Record<string, string>
    expect(owner.to).toBe('owner@example.test')
    expect(owner.subject).toBe('Ada Lovelace joined Inner Ring')
    expect(owner.text).toContain('payout account')

    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'owner-1',
      actor_id: 'member-1',
      type: SPACE_MEMBER_PAID_NOTIFICATION_TYPE,
      reference_type: 'space',
      reference_id: 'blue-door',
    })
  })

  it('a member with no address still leaves the Space told, and logs the miss', async () => {
    m.accountEmails.delete('member-1')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendSpaceMembershipReceipts(opts)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('owner@example.test')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('an unreadable Space sends nothing, says so, and does not throw', async () => {
    m.spaces.clear()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendSpaceMembershipReceipts(opts)).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('writes no em dash', async () => {
    await sendSpaceMembershipReceipts(opts)
    for (const c of m.enqueueEmail.mock.calls) {
      const p = c[0] as Record<string, string>
      expect(`${p.subject}${p.text}${p.html}`).not.toContain('—')
    }
  })
})

describe('sendSpacePlanReceipt', () => {
  it('names the plan and what it costs, and there is no second party', async () => {
    await sendSpacePlanReceipt({ spaceId: 'space-1', plan: 'business', sub: sub([{ unit: 2900 }]) })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.to).toBe('owner@example.test')
    expect(p.subject).toContain('Blue Door is on the')
    expect(p.text).toContain('$29 a month')
    expect(p.text).toContain('https://freq.test/spaces/blue-door/settings/billing')
    expect(`${p.subject}${p.text}`).not.toContain('—')
  })

  it('a TRIAL says nothing has been charged yet', async () => {
    await sendSpacePlanReceipt({ spaceId: 'space-1', plan: 'business', sub: sub([{ unit: 2900 }], 'trialing') })
    const text = (m.enqueueEmail.mock.calls[0][0] as Record<string, string>).text
    expect(text).toContain('nothing has been charged yet')
    expect(text).toContain('Billing starts when the trial ends')
  })

  it('a Space with no owner sends nothing, says so, and does not throw', async () => {
    m.spaces.set('space-1', { owner_profile_id: null, name: 'Blue Door', brand_name: null, slug: 'blue-door' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      sendSpacePlanReceipt({ spaceId: 'space-1', plan: 'business', sub: sub([{ unit: 2900 }]) }),
    ).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('sendMembershipInvoiceReceipt', () => {
  it('says CONTRIBUTION for Crew and never prices it as a purchase', async () => {
    await sendMembershipInvoiceReceipt({
      profileId: 'member-1',
      amountCents: 800,
      currency: 'usd',
      tier: 'crew',
      invoiceId: 'in_1',
    })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.subject).toBe('Your Crew contribution')
    expect(p.text).toContain('$8 Crew contribution')
    expect(p.text).toContain('Every Crew amount carries the same access')
  })

  it('says PAYMENT for anything that is not Crew, including the bundle', async () => {
    await sendMembershipInvoiceReceipt({
      profileId: 'member-1',
      amountCents: 1900,
      currency: 'usd',
      tier: 'crew',
      kind: 'household_bundle',
      invoiceId: 'in_2',
    })
    const p = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(p.subject).toBe('Your Frequency membership payment')
    expect(p.text).toContain('membership payment')
  })

  it('an invoice that resolves to no member enqueues nothing and says so', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendMembershipInvoiceReceipt({ profileId: null, amountCents: 800, currency: 'usd', invoiceId: 'in_3' })
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a member with no address enqueues nothing, says so, and does not throw', async () => {
    m.accountEmails.clear()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      sendMembershipInvoiceReceipt({ profileId: 'member-1', amountCents: 800, currency: 'usd', invoiceId: 'in_4' }),
    ).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
