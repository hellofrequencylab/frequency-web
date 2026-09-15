import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE ORDER RECEIPT + THE SALE NOTICE (lib/commerce/order-receipt.ts, LIVE-344). Before this, a paid
// order told nobody: not the buyer, not the seller. Locks:
//   1. A Space order enqueues TWO emails (buyer + seller) and writes ONE bell row for the seller.
//   2. A PLATFORM (Frequency Store) order receipts the buyer and notifies nobody: Frequency is the
//      seller, and there is no operator waiting on it.
//   3. A buyer with no account is still receipted, at the address Stripe collected.
//   4. A buyer with NO address at all enqueues nothing for the buyer, says so out loud, and the
//      SELLER's notice still goes.
//   5. Nothing here throws, whatever the database does.
//   6. The copy carries no em dash (docs/CONTENT-VOICE.md hard rule).

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  accountEmails: new Map<string, string>(),
  profiles: new Map<string, { display_name: string | null }>(),
  spaces: new Map<string, Record<string, unknown>>(),
  items: [] as { title: string | null; qty: number | null }[],
  itemsError: null as null | { message: string },
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async (id: string) => m.accountEmails.get(id) ?? null,
}))
vi.mock('@/lib/billing/stripe', () => ({ appUrl: () => 'https://freq.test', stripe: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      if (table === 'commerce_order_items') {
        return { select: () => ({ eq: async () => ({ data: m.itemsError ? null : m.items, error: m.itemsError }) }) }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: m.profiles.get(id) ?? null, error: null }) }),
          }),
        }
      }
      if (table === 'spaces') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: m.spaces.get(id) ?? null, error: null }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { sendOrderReceipts, ORDER_SOLD_NOTIFICATION_TYPE } from './order-receipt'

const spaceOrder = {
  id: 'order-1',
  ownerKind: 'space' as const,
  ownerProfileId: null,
  ownerSpaceId: 'space-1',
  buyerProfileId: 'buyer-1',
  amountCents: 2400,
  currency: 'usd',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.accountEmails.clear()
  m.accountEmails.set('buyer-1', 'buyer@example.test')
  m.accountEmails.set('owner-1', 'owner@example.test')
  m.profiles.clear()
  m.profiles.set('buyer-1', { display_name: 'Ada Lovelace' })
  m.profiles.set('owner-1', { display_name: 'Grace Hopper' })
  m.spaces.clear()
  m.spaces.set('space-1', { owner_profile_id: 'owner-1', name: 'Blue Door', brand_name: null, slug: 'blue-door' })
  m.items = [{ title: 'Two mugs', qty: 2 }]
  m.itemsError = null
})

describe('sendOrderReceipts', () => {
  it('receipts the buyer and notifies the seller: two emails, one bell', async () => {
    await sendOrderReceipts(spaceOrder)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(2)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)

    const buyer = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(buyer.to).toBe('buyer@example.test')
    expect(buyer.subject).toBe('Your order: Two mugs')
    expect(buyer.text).toContain('Blue Door')
    expect(buyer.text).toContain('$24')
    expect(buyer.text).toContain('Two mugs x2')

    const seller = m.enqueueEmail.mock.calls[1][0] as Record<string, string>
    expect(seller.to).toBe('owner@example.test')
    expect(seller.subject).toBe('You sold Two mugs x2')
    expect(seller.text).toContain('Ada Lovelace')
    expect(seller.text).toContain('payout account')

    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'owner-1',
      actor_id: 'buyer-1',
      type: ORDER_SOLD_NOTIFICATION_TYPE,
      reference_type: 'space',
      reference_id: 'blue-door',
    })
  })

  it('a first-party Frequency Store order receipts the buyer and notifies nobody', async () => {
    await sendOrderReceipts({ ...spaceOrder, ownerKind: 'platform', ownerSpaceId: null })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).text).toContain('Frequency')
  })

  it('a member seller is notified and their bell points at the buyer', async () => {
    await sendOrderReceipts({ ...spaceOrder, ownerKind: 'profile', ownerProfileId: 'owner-1', ownerSpaceId: null })
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'owner-1',
      reference_type: 'profile',
      reference_id: 'buyer-1',
    })
    expect((m.enqueueEmail.mock.calls[1][0] as Record<string, string>).text).toContain('https://freq.test/market/manage')
  })

  it('a buyer with no account is receipted at the address Stripe collected', async () => {
    await sendOrderReceipts({ ...spaceOrder, buyerProfileId: null, buyerEmail: 'guest@example.test' })
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('guest@example.test')
  })

  it('a buyer with NO address is logged, and the seller is still told', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendOrderReceipts({ ...spaceOrder, buyerProfileId: null, buyerEmail: null })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('owner@example.test')
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a Space that cannot be read still receipts the buyer, and says nobody was notified', async () => {
    m.spaces.clear()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendOrderReceipts(spaceOrder)).resolves.toBeUndefined()
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('unreadable line items cost a label, never the receipt', async () => {
    m.itemsError = { message: 'boom' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendOrderReceipts(spaceOrder)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(2)
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).subject).toBe('Your order from Blue Door')
    warn.mockRestore()
  })

  it('never throws, and writes no em dash', async () => {
    await sendOrderReceipts(spaceOrder)
    for (const call of m.enqueueEmail.mock.calls) {
      const p = call[0] as Record<string, string>
      expect(p.text).not.toContain('—')
      expect(p.html).not.toContain('—')
      expect(p.subject).not.toContain('—')
    }
  })
})
