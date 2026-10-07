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
//   7. A SPLIT order (LIVE-706) receipts the buyer with the lines grouped under each seller's name,
//      and notifies each seller with a transfer row once, for their share only. A single-seller order
//      never reads the transfer ledger and renders the same bytes it did before.
//   8. A split order the reconciler planned after the settle missed it (LIVE-733) sends the sellers
//      of the rows it is given the same notice the settle sends, and nobody else: not the buyer, not
//      a seller whose row it was not given.

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  /** Every table the receipts read, in order. */
  tables: [] as string[],
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  accountEmails: new Map<string, string>(),
  profiles: new Map<string, { display_name: string | null }>(),
  spaces: new Map<string, Record<string, unknown>>(),
  items: [] as Record<string, unknown>[],
  /** The split order's transfer ledger rows (LIVE-706), as commerce_order_transfers holds them. */
  transfers: [] as Record<string, unknown>[],
  transfersError: null as null | { message: string },
  itemsError: null as null | { message: string },
  /** The Journeys the order bought, as `journeySlugsForOrder` would resolve them (PROG-GD5). */
  journeySlugs: [] as string[],
  /** commerce_orders by id, for the recovered notice's own read of the order (LIVE-733). */
  orders: new Map<string, Record<string, unknown>>(),
  ordersError: null as null | { message: string },
}))

vi.mock('./journey-fulfilment', () => ({ journeySlugsForOrder: async () => m.journeySlugs }))

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
vi.mock('@/lib/billing/stripe', () => ({ appUrl: () => 'https://freq.test', stripe: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      m.tables.push(table)
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      if (table === 'commerce_order_items') {
        return { select: () => ({ eq: async () => ({ data: m.itemsError ? null : m.items, error: m.itemsError }) }) }
      }
      if (table === 'commerce_order_transfers') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: m.transfersError ? null : m.transfers, error: m.transfersError }),
            }),
          }),
        }
      }
      if (table === 'commerce_orders') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({
                data: m.ordersError ? null : m.orders.get(id) ?? null,
                error: m.ordersError,
              }),
            }),
          }),
        }
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

import { sendOrderReceipts, sendRecoveredSplitSaleNotices, ORDER_SOLD_NOTIFICATION_TYPE } from './order-receipt'

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
  m.transfers = []
  m.transfersError = null
  m.tables.length = 0
  m.journeySlugs = []
  m.orders.clear()
  m.ordersError = null
})

// ── THE WELCOME (PROG-GD5) ───────────────────────────────────────────────────────────────────────
// A Journey is not "sent on"; it opens. The receipt's button is the Journey's welcome, reached
// through the sign-in door so a guest's tap is the proof of the address (ADR-854) and a member
// passes straight through. Measured before this: the only link was /orders, a member page the
// shell bounces a signed-out guest away from, so the receipt's one door was dead for exactly the
// person it was written for.
describe('sendOrderReceipts — a Journey order opens onto the Journey', () => {
  it('a guest is sent through sign-in to the welcome, with the address that paid prefilled', async () => {
    m.journeySlugs = ['heart-on-fire']
    m.items = [{ title: 'Heart on Fire', qty: 1 }]
    await sendOrderReceipts({ ...spaceOrder, buyerProfileId: null, buyerEmail: 'guest@example.test' })
    const buyer = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(buyer.text).toContain(
      'https://freq.test/sign-in?next=/journeys/heart-on-fire/welcome&email=guest%40example.test',
    )
    expect(buyer.text).toContain('Open your Journey')
    expect(buyer.text).toContain('sign in with this address')
    expect(buyer.text).not.toContain('will send it on')
  })

  it('a member goes through the same door with no address to prefill, and is told it is theirs', async () => {
    m.journeySlugs = ['heart-on-fire']
    m.items = [{ title: 'Heart on Fire', qty: 1 }]
    await sendOrderReceipts(spaceOrder)
    const buyer = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(buyer.text).toContain('https://freq.test/sign-in?next=/journeys/heart-on-fire/welcome')
    expect(buyer.text).not.toContain('email=')
    expect(buyer.text).toContain('The Journey is yours now')
  })

  it('an order that bought no Journey keeps My orders as its door', async () => {
    await sendOrderReceipts(spaceOrder)
    const buyer = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(buyer.text).toContain('https://freq.test/orders')
    expect(buyer.text).toContain('See my orders')
    expect(buyer.text).not.toContain('/welcome')
  })
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

// ── THE SPLIT ORDER (LIVE-706) ───────────────────────────────────────────────────────────────────
// Measured on main before this: a split order's buyer receipt named Frequency as the seller ("Frequency
// can see the order now and will send it on", false: each seller ships their own lines) and the
// seller half logged "no seller to notify" and returned, so neither seller heard about the sale.
describe('sendOrderReceipts — a split order', () => {
  const splitOrder = {
    id: 'order-2',
    ownerKind: 'split' as const,
    ownerProfileId: null,
    ownerSpaceId: null,
    buyerProfileId: 'buyer-1',
    amountCents: 3400,
    currency: 'usd',
  }
  const spaceLine = { owner_kind: 'space', owner_profile_id: 'owner-1', owner_space_id: 'space-1' }
  const makerLine = { owner_kind: 'profile', owner_profile_id: 'maker-1', owner_space_id: null }
  const transferRow = (id: string, owner: Record<string, unknown>, amount: number, fee: number) => ({
    id,
    order_id: 'order-2',
    ...owner,
    stripe_account_id: `acct_${id}`,
    amount_cents: amount,
    platform_fee_cents: fee,
    currency: 'usd',
    status: 'created',
    stripe_transfer_id: `tr_${id}`,
    reversed_cents: 0,
    attempts: 1,
    last_error: null,
  })

  beforeEach(() => {
    m.accountEmails.set('maker-1', 'maker@example.test')
    m.profiles.set('maker-1', { display_name: 'Rosa Parks' })
    m.items = [
      { title: 'Two mugs', qty: 2, subtotal_cents: 2400, commerce_products: spaceLine },
      { title: 'One print', qty: 1, subtotal_cents: 1000, commerce_products: makerLine },
    ]
    // Blue Door's share was network-sourced (a $1.20 fee); the maker's was their own, 0%.
    m.transfers = [transferRow('t1', spaceLine, 2280, 120), transferRow('t2', makerLine, 1000, 0)]
  })

  const sent = () => m.enqueueEmail.mock.calls.map((c) => c[0] as Record<string, string>)

  it('the buyer receipt names both sellers and lists each seller’s lines under their name', async () => {
    await sendOrderReceipts(splitOrder)
    const buyer = sent().find((p) => p.to === 'buyer@example.test')!
    expect(buyer.subject).toBe('Your order: Two mugs')
    expect(buyer.text).toContain('Your order from Blue Door and Rosa Parks is paid, $34 in total.')
    expect(buyer.text).toContain('Blue Door: Two mugs x2 ($24)')
    expect(buyer.text).toContain('Rosa Parks: One print ($10)')
    expect(buyer.text).toContain('Total: $34')
    expect(buyer.text).toContain('more than one delivery')
    // Never the merchant of record as the seller who ships.
    expect(buyer.text).not.toContain('Frequency can see the order')
    expect(buyer.text).not.toContain('Seller: Frequency')
  })

  it('each seller is notified once, with only their lines and their net', async () => {
    await sendOrderReceipts(splitOrder)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(3)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(2)

    const space = sent().filter((p) => p.to === 'owner@example.test')
    expect(space).toHaveLength(1)
    expect(space[0].subject).toBe('You sold Two mugs x2')
    expect(space[0].text).toContain('Ada Lovelace bought Two mugs x2 for $24.')
    expect(space[0].text).toContain('Network fee: $1.20')
    expect(space[0].text).toContain('You receive: $22.80')
    expect(space[0].text).toContain('https://freq.test/spaces/blue-door/settings/shop')
    expect(space[0].text).not.toContain('One print')
    expect(space[0].text).not.toContain('$34')

    const maker = sent().filter((p) => p.to === 'maker@example.test')
    expect(maker).toHaveLength(1)
    expect(maker[0].subject).toBe('You sold One print')
    expect(maker[0].text).toContain('You receive: $10')
    // A 0% share prints no fee row at all.
    expect(maker[0].text).not.toContain('Network fee')
    expect(maker[0].text).not.toContain('Two mugs')
    expect(maker[0].text).toContain('https://freq.test/market/manage')

    const bells = m.notificationsInsert.mock.calls.map((c) => c[0])
    expect(bells[0]).toMatchObject({
      recipient_id: 'owner-1',
      type: ORDER_SOLD_NOTIFICATION_TYPE,
      reference_type: 'space',
      reference_id: 'blue-door',
      body: 'bought Two mugs x2 for $24',
    })
    expect(bells[1]).toMatchObject({
      recipient_id: 'maker-1',
      reference_type: 'profile',
      reference_id: 'buyer-1',
      body: 'bought One print for $10',
    })
    for (const p of sent()) {
      expect(p.text).not.toContain('—')
      expect(p.html).not.toContain('—')
      expect(p.subject).not.toContain('—')
    }
  })

  it('an unreadable transfer ledger still receipts the buyer, notifies nobody, and says so', async () => {
    m.transfersError = { message: 'boom' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendOrderReceipts(splitOrder)).resolves.toBeUndefined()
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(sent()[0].to).toBe('buyer@example.test')
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(err.mock.calls.some((c) => String(c[0]).includes('no seller was notified'))).toBe(true)
    err.mockRestore()
  })

  it('a split order with no transfer rows notifies nobody, and says so', async () => {
    m.transfers = []
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await sendOrderReceipts(splitOrder)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(err.mock.calls.some((c) => String(c[0]).includes('no transfer rows'))).toBe(true)
    err.mockRestore()
  })

  it('unreadable lines still name every seller the ledger pays, with their share', async () => {
    m.itemsError = { message: 'boom' }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendOrderReceipts(splitOrder)
    const buyer = sent().find((p) => p.to === 'buyer@example.test')!
    expect(buyer.subject).toBe('Your order from Blue Door and Rosa Parks')
    expect(buyer.text).toContain('Blue Door: $24')
    expect(buyer.text).toContain('Rosa Parks: $10')
    expect(m.notificationsInsert).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  // ── THE RECOVERED ORDER (LIVE-733) ─────────────────────────────────────────────────────────────
  describe('sendRecoveredSplitSaleNotices', () => {
    beforeEach(() => {
      m.orders.set('order-2', {
        id: 'order-2',
        owner_kind: 'split',
        owner_profile_id: null,
        owner_space_id: null,
        buyer_profile_id: 'buyer-1',
        amount_cents: 3400,
        currency: 'usd',
      })
    })

    it('sends each seller it is given the exact notice the settle sends, and the buyer nothing', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
      let settle: Record<string, string>[]
      try {
        await sendOrderReceipts(splitOrder)
        settle = sent().filter((p) => p.to !== 'buyer@example.test')
        vi.clearAllMocks()
        await expect(sendRecoveredSplitSaleNotices('order-2', ['t1', 't2'])).resolves.toBe(2)
      } finally {
        vi.useRealTimers()
      }
      expect(sent().some((p) => p.to === 'buyer@example.test')).toBe(false)
      expect(m.enqueueEmail).toHaveBeenCalledTimes(2)
      expect(m.notificationsInsert).toHaveBeenCalledTimes(2)
      const pick = (p: Record<string, string>) => ({ to: p.to, subject: p.subject, text: p.text, html: p.html })
      expect(sent().map(pick)).toEqual(settle.map(pick))
      expect(m.notificationsInsert.mock.calls.map((c) => c[0])).toEqual([
        expect.objectContaining({ recipient_id: 'owner-1', type: ORDER_SOLD_NOTIFICATION_TYPE, reference_id: 'blue-door' }),
        expect.objectContaining({ recipient_id: 'maker-1', type: ORDER_SOLD_NOTIFICATION_TYPE, reference_id: 'buyer-1' }),
      ])
      for (const p of sent()) expect(p.text).not.toContain('—')
    })

    it('a seller whose row it was not given is not told again', async () => {
      await expect(sendRecoveredSplitSaleNotices('order-2', ['t2'])).resolves.toBe(1)
      expect(sent().map((p) => p.to)).toEqual(['maker@example.test'])
      expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    })

    it('no row ids reads nothing and sends nothing: a replay of the plan has none', async () => {
      await expect(sendRecoveredSplitSaleNotices('order-2', [])).resolves.toBe(0)
      expect(m.tables).toEqual([])
      expect(m.enqueueEmail).not.toHaveBeenCalled()
    })

    it('an unreadable order or ledger sends nothing, says so, and never throws', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      m.ordersError = { message: 'boom' }
      await expect(sendRecoveredSplitSaleNotices('order-2', ['t1'])).resolves.toBe(0)
      expect(err.mock.calls.some((c) => String(c[0]).includes('no seller was notified'))).toBe(true)
      m.ordersError = null
      m.transfersError = { message: 'boom' }
      await expect(sendRecoveredSplitSaleNotices('order-2', ['t1'])).resolves.toBe(0)
      expect(err.mock.calls.some((c) => String(c[0]).includes('split order transfers unreadable'))).toBe(true)
      m.transfersError = null
      await expect(sendRecoveredSplitSaleNotices('order-2', ['t-gone'])).resolves.toBe(0)
      expect(err.mock.calls.some((c) => String(c[0]).includes('rows not found'))).toBe(true)
      expect(m.enqueueEmail).not.toHaveBeenCalled()
      expect(m.notificationsInsert).not.toHaveBeenCalled()
      err.mockRestore()
    })

    it('a seller who cannot be resolved is logged and not counted as told', async () => {
      m.spaces.clear()
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(sendRecoveredSplitSaleNotices('order-2', ['t1', 't2'])).resolves.toBe(1)
      expect(err.mock.calls.some((c) => String(c[0]).includes('no seller to notify'))).toBe(true)
      err.mockRestore()
    })
  })
})

// ── A SINGLE-SELLER ORDER IS UNCHANGED (LIVE-706) ────────────────────────────────────────────────
// The two messages below were rendered by lib/commerce/order-receipt.ts on main before LIVE-706 and
// pasted in unedited. A single-seller order must never read the transfer ledger and must send exactly
// these bytes.
describe('sendOrderReceipts — a single-seller order is byte-identical to before the split half', () => {
  it('a Space order sends the same two messages and never reads the transfer ledger', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    try {
      await sendOrderReceipts(spaceOrder)
    } finally {
      vi.useRealTimers()
    }
    expect(m.tables).not.toContain('commerce_order_transfers')
    const [buyer, seller] = m.enqueueEmail.mock.calls.map((c) => c[0] as Record<string, string>)
    expect({ subject: buyer.subject, text: buyer.text }).toMatchInlineSnapshot(`
      {
        "subject": "Your order: Two mugs",
        "text": "Hi Ada Lovelace,

      Your order from Blue Door is paid, $24 in total.

      Order: Two mugs x2
      Total: $24
      Seller: Blue Door
      Date: September 30, 2026

      See my orders: https://freq.test/orders

      Blue Door can see the order now and will send it on.

      My orders keeps every purchase you make on Frequency, with the seller and the total.

      Made with Frequency: https://freq.test/?utm_source=made-with&utm_medium=order-receipt&utm_campaign=made-with-frequency",
      }
    `)
    expect({ subject: seller.subject, text: seller.text }).toMatchInlineSnapshot(`
      {
        "subject": "You sold Two mugs x2",
        "text": "Hi Grace Hopper,

      Ada Lovelace bought Two mugs x2 for $24.

      Order: Two mugs x2
      Total: $24
      Buyer: Ada Lovelace
      Date: September 30, 2026

      Open Orders: https://freq.test/spaces/blue-door/settings/shop

      The money goes to your payout account on your usual payout schedule.

      Open Orders to see the shipping details and mark it sent.",
      }
    `)
  })
})
