import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2551: a refunded ticket tells the buyer (email) and whoever was paid (bell and email), once,
// and stays silent on a cancelled event because the cancellation writes its own message.
const m = vi.hoisted(() => ({
  insert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>, _o?: Record<string, unknown>) => {}),
  suppressed: false,
  rows: new Map<string, Record<string, unknown> | null>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/email')>()),
  enqueueEmail: (p: Record<string, unknown>, o?: Record<string, unknown>) => m.enqueueEmail(p, o),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true }) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => m.suppressed }))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async (id: string) => `${id}@example.com` }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'notifications'
        ? { insert: (row: Record<string, unknown>) => m.insert(row) }
        : { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: m.rows.get(`${table}:${id}`) ?? null, error: null }) }) }) },
  }),
}))

import { buyerRefundSentence, hostRefundSentence, notifyTicketRefund, TICKET_REFUND_NOTIFICATION_TYPE } from './ticket-refund-notify'

const mails = () => m.enqueueEmail.mock.calls.map((c) => ({ ...(c[0] as { to: string; subject: string; text: string }), key: (c[1] as { dedupeKey: string }).dedupeKey }))

beforeEach(() => {
  vi.clearAllMocks()
  m.suppressed = false
  m.rows.clear()
  m.rows.set('event_tickets:t1', { id: 't1', event_id: 'e1', buyer_profile_id: null, guest_email: 'guest@example.com', qty: 1, amount_cents: 4400, currency: 'usd' })
  m.rows.set('events:e1', { title: 'Hypnotic Sound', slug: 'hypnotic-sound', host_id: 'host', host_space_id: 's1', is_cancelled: false })
  m.rows.set('spaces:s1', { owner_profile_id: 'owner', slug: 'house-of-fates' })
  m.rows.set('profiles:owner', { display_name: 'Toni' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the words', () => {
  it('agree with the count and name the amount', () => {
    expect(buyerRefundSentence({ qty: 1, eventTitle: 'X', amountLabel: '$44.00' })).toMatch(/^Your ticket to X was refunded\. \$44\.00 is on its way back/)
    expect(buyerRefundSentence({ qty: 2, eventTitle: 'X', amountLabel: null })).toMatch(/^Your 2 tickets to X were refunded\. The money is/)
    expect(hostRefundSentence({ buyerName: 'Dana', qty: 1, eventTitle: 'X', amountLabel: '$44.00' })).toBe('Dana’s ticket to X was refunded ($44.00)')
  })
  it('carry no em or en dashes', () => {
    expect(buyerRefundSentence({ qty: 3, eventTitle: 'X', amountLabel: '$1.00' })).not.toMatch(/[–—]/)
  })
})

describe('notifyTicketRefund', () => {
  it('emails a guest buyer at the address they paid with, and tells the Space owner by bell and email', async () => {
    await notifyTicketRefund('t1')
    const sent = mails()
    expect(sent.map((s) => s.to)).toEqual(['guest@example.com', 'owner@example.com'])
    expect(sent[0].subject).toBe('Your refund for Hypnotic Sound')
    expect(sent[0].key).toBe('ticket-refund-buyer:t1')
    expect(sent[1].key).toBe('ticket-refund-host:t1')
    expect(sent[1].text).toContain('/spaces/house-of-fates/settings/shop?tab=orders')
    const bell = m.insert.mock.calls[0][0]
    expect(bell).toMatchObject({ recipient_id: 'owner', type: TICKET_REFUND_NOTIFICATION_TYPE, reference_id: 'e1' })
    expect(bell.body).toBe('A guest’s ticket to Hypnotic Sound was refunded ($44)')
  })

  it('emails a member buyer at their account address and names them to the host', async () => {
    m.rows.set('event_tickets:t1', { id: 't1', event_id: 'e1', buyer_profile_id: 'dana', guest_email: null, qty: 2, amount_cents: 8800, currency: 'usd' })
    m.rows.set('profiles:dana', { display_name: 'Dana' })
    await notifyTicketRefund('t1')
    expect(mails()[0].to).toBe('dana@example.com')
    expect(m.insert.mock.calls[0][0].body).toBe('Dana’s 2 tickets to Hypnotic Sound were refunded ($88)')
  })

  it('does not email a suppressed guest address, and still tells the owner', async () => {
    m.suppressed = true
    await notifyTicketRefund('t1')
    expect(mails().map((s) => s.to)).toEqual(['owner@example.com'])
  })

  it('says nothing on a cancelled event: the cancellation writes its own message', async () => {
    m.rows.set('events:e1', { title: 'Hypnotic Sound', slug: 'hypnotic-sound', host_id: 'host', host_space_id: 's1', is_cancelled: true })
    await notifyTicketRefund('t1')
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('never throws when the ticket cannot be read', async () => {
    await expect(notifyTicketRefund('missing')).resolves.toBeUndefined()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
  })
})
