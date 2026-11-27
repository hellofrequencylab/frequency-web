import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A tiny recording stand-in for the query builder: every filter is remembered per table, and the
// awaited result is that table's rows.
const H = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, string>,
  calls: [] as { table: string; op: string; args: unknown[] }[],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'in', 'eq', 'ilike', 'order', 'limit']) {
        b[op] = (...args: unknown[]) => {
          H.calls.push({ table, op, args })
          return b
        }
      }
      b.then = (resolve: (v: unknown) => void) =>
        resolve(H.errors[table] ? { data: null, error: { message: H.errors[table] } } : { data: H.rows[table] ?? [], error: null })
      return b
    },
  }),
}))

import { classifyPaymentQuery, findPayments } from './payments-finder'

const reset = () => {
  H.rows = {}
  H.errors = {}
  H.calls.length = 0
}

describe('classifyPaymentQuery (LIVE-2547)', () => {
  it('reads a Stripe id, an email, a name and nothing', () => {
    expect(classifyPaymentQuery('  pi_3UgGl8Phy  ')).toEqual({ kind: 'intent', value: 'pi_3UgGl8Phy' })
    expect(classifyPaymentQuery('Guest@Example.com')).toEqual({ kind: 'email', value: 'guest@example.com' })
    expect(classifyPaymentQuery('Toni')).toEqual({ kind: 'name', value: 'Toni' })
    expect(classifyPaymentQuery('')).toEqual({ kind: 'none' })
  })
})

describe('findPayments (LIVE-2547)', () => {
  it('lists tickets, donations and orders together, newest first, with the Space and the buyer', async () => {
    reset()
    H.rows.event_tickets = [
      { id: 't1', event_id: 'e1', buyer_profile_id: null, guest_email: 'guest@example.com', amount_cents: 4400, platform_fee_cents: 0, currency: 'usd', status: 'succeeded', created_at: '2026-11-27T04:20:00Z', succeeded_at: '2026-11-27T04:27:00Z', stripe_payment_intent_id: 'pi_1' },
    ]
    H.rows.space_donations = [
      { id: 'd1', space_id: 's1', donor_profile_id: 'p1', amount_cents: 1000, platform_fee_cents: 0, currency: 'usd', status: 'refunded', created_at: '2026-11-26T00:00:00Z', succeeded_at: '2026-11-26T00:01:00Z', stripe_payment_intent_id: 'pi_2' },
    ]
    H.rows.commerce_orders = [
      { id: 'o1', owner_space_id: 's1', buyer_profile_id: 'p1', guest_email: null, amount_cents: 2500, platform_fee_cents: 250, currency: 'usd', status: 'fulfilled', created_at: '2026-11-28T00:00:00Z', stripe_payment_intent_id: 'pi_3', commerce_order_items: [{ title: 'Candle' }, { title: 'Oil' }] },
    ]
    H.rows.events = [{ id: 'e1', title: 'Hypnotic Sound', host_space_id: 's1', space_id: null }]
    H.rows.spaces = [{ id: 's1', name: 'House of Fates', slug: 'house-of-fates' }]
    H.rows.profiles = [{ id: 'p1', display_name: 'Dana' }]

    const { payments, unreadable } = await findPayments('')
    expect(unreadable).toEqual([])
    expect(payments.map((p) => `${p.kind}:${p.id}`)).toEqual(['order:o1', 'ticket:t1', 'donation:d1'])
    expect(payments[1]).toMatchObject({ title: 'Hypnotic Sound', buyer: 'guest@example.com', spaceName: 'House of Fates', spaceSlug: 'house-of-fates', status: 'paid', amountCents: 4400 })
    expect(payments[0]).toMatchObject({ title: 'Candle +1', buyer: 'Dana', status: 'paid' })
    expect(payments[2].status).toBe('refunded')
  })

  it('narrows every source by a Stripe payment id', async () => {
    reset()
    await findPayments('pi_3UgGl8')
    const eqs = H.calls.filter((c) => c.op === 'eq' && c.args[0] === 'stripe_payment_intent_id').map((c) => c.table)
    expect(eqs.sort()).toEqual(['commerce_orders', 'event_tickets', 'space_donations'])
  })

  it('searches a guest email on tickets and orders, and skips donations (a gift carries no guest email)', async () => {
    reset()
    await findPayments('guest@example.com')
    expect(H.calls.filter((c) => c.op === 'ilike').map((c) => c.table).sort()).toEqual(['commerce_orders', 'event_tickets'])
    expect(H.calls.some((c) => c.table === 'space_donations')).toBe(false)
  })

  it('names a source it could not read, and still lists the rest', async () => {
    reset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    H.errors.space_donations = 'boom'
    H.rows.event_tickets = [
      { id: 't1', event_id: 'e1', buyer_profile_id: null, guest_email: null, amount_cents: 100, platform_fee_cents: 0, currency: 'usd', status: 'succeeded', created_at: '2026-11-27T00:00:00Z', succeeded_at: null, stripe_payment_intent_id: null },
    ]
    const { payments, unreadable } = await findPayments('')
    expect(unreadable).toEqual(['space_donations'])
    expect(payments).toHaveLength(1)
  })
})
