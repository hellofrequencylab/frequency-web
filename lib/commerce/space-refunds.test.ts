import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | null>,
  order: vi.fn(async (_id: string) => ({ ok: true }) as { ok?: true; error?: string }),
  ticket: vi.fn(async (_id: string, _eventId: string) => ({ ok: true }) as { ok?: true; error?: string }),
  donation: vi.fn(async (_id: string, _spaceId: string) => ({ ok: true }) as { ok?: true; error?: string }),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: H.rows[table] ?? null, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/commerce/checkout', () => ({ refundCommerceOrder: H.order }))
vi.mock('@/lib/billing/tickets', () => ({ refundTicket: H.ticket }))
vi.mock('@/lib/billing/space-donation-checkout', () => ({ refundSpaceDonation: H.donation }))

import { eventSellsForSpace, refundSpaceSale } from './space-refunds'

describe('eventSellsForSpace (LIVE-2550)', () => {
  it('follows the host when there is one, the owner Space when there is not', () => {
    expect(eventSellsForSpace({ host_space_id: 's1', space_id: 's2' }, 's1')).toBe(true)
    expect(eventSellsForSpace({ host_space_id: 's1', space_id: 's2' }, 's2')).toBe(false)
    expect(eventSellsForSpace({ host_space_id: null, space_id: 's2' }, 's2')).toBe(true)
    expect(eventSellsForSpace(null, 's2')).toBe(false)
  })
})

describe('refundSpaceSale (LIVE-2550)', () => {
  beforeEach(() => {
    H.rows = {}
    H.order.mockClear()
    H.ticket.mockClear()
    H.donation.mockClear()
  })

  it('refunds an order the Space owns', async () => {
    H.rows.commerce_orders = { id: 'o1', owner_space_id: 's1', funds_flow: 'destination' }
    expect(await refundSpaceSale('s1', 'order', 'o1')).toEqual({ ok: true })
    expect(H.order).toHaveBeenCalledWith('o1')
  })

  it('refuses another Space’s order without moving money', async () => {
    H.rows.commerce_orders = { id: 'o1', owner_space_id: 'other', funds_flow: 'destination' }
    expect(await refundSpaceSale('s1', 'order', 'o1')).toHaveProperty('error')
    expect(H.order).not.toHaveBeenCalled()
  })

  it('leaves a split order with staff', async () => {
    H.rows.commerce_orders = { id: 'o1', owner_space_id: 's1', funds_flow: 'separate' }
    expect(await refundSpaceSale('s1', 'order', 'o1')).toHaveProperty('error')
    expect(H.order).not.toHaveBeenCalled()
  })

  it('refunds a ticket to an event the Space hosts, pinned to that event', async () => {
    H.rows.event_tickets = { id: 't1', event_id: 'e1' }
    H.rows.events = { host_space_id: 's1', space_id: null }
    expect(await refundSpaceSale('s1', 'ticket', 't1')).toEqual({ ok: true })
    expect(H.ticket).toHaveBeenCalledWith('t1', 'e1')
  })

  it('refuses a ticket to someone else’s event', async () => {
    H.rows.event_tickets = { id: 't1', event_id: 'e1' }
    H.rows.events = { host_space_id: 'other', space_id: 's1' }
    expect(await refundSpaceSale('s1', 'ticket', 't1')).toHaveProperty('error')
    expect(H.ticket).not.toHaveBeenCalled()
  })

  it('hands a donation to its refund path with the Space pinned, and passes a refusal through', async () => {
    expect(await refundSpaceSale('s1', 'donation', 'd1')).toEqual({ ok: true })
    expect(H.donation).toHaveBeenCalledWith('d1', 's1')
    H.donation.mockResolvedValueOnce({ error: 'Donation not found.' })
    expect(await refundSpaceSale('s1', 'donation', 'd2')).toEqual({ error: 'Donation not found.' })
  })
})
