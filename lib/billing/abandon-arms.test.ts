import { describe, expect, it, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// One recording fake for the admin client. Each `.update()` chain records the table, the payload and
// every predicate applied, so a test can assert the GUARD as well as the write.
type Call = { table: string; values: Record<string, unknown>; eq: [string, string][]; isNull: string[] }
const calls: Call[] = []

function chainFor(table: string, values: Record<string, unknown>) {
  const call: Call = { table, values, eq: [], isNull: [] }
  calls.push(call)
  const chain = {
    eq: (c: string, v: string) => {
      call.eq.push([c, v])
      return chain
    },
    is: (c: string, _v: null) => {
      call.isNull.push(c)
      return Promise.resolve({ error: null })
    },
    then: (res: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({ update: (values: Record<string, unknown>) => chainFor(table, values) }),
  }),
}))
vi.mock('./stripe', () => ({ stripe: null, appUrl: () => 'https://x.test', STRIPE_API_VERSION: 'x' }))
vi.mock('./connect', () => ({ payoutsLive: async () => true, getConnectStatus: async () => ({}) }))

import { abandonTicketFromSession } from './tickets'
import { abandonTipFromSession } from './tips'

const session = (kind: string, id = 'cs_1') =>
  ({ id, metadata: { kind } }) as unknown as Stripe.Checkout.Session

beforeEach(() => {
  calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('abandonTicketFromSession', () => {
  it('releases a pending ticket as failed, keyed on the session', async () => {
    await abandonTicketFromSession(session('ticket'))
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('event_tickets')
    // 🔴 `failed`, not `abandoned`: event_tickets_status_check does not allow `abandoned`, so the
    // donation arm's value would be a runtime constraint violation on a money table.
    expect(calls[0].values).toEqual({ status: 'failed' })
  })

  it('is idempotent: it can only ever move a row that is still pending', async () => {
    await abandonTicketFromSession(session('ticket', 'cs_7'))
    expect(calls[0].eq).toEqual([
      ['stripe_checkout_session_id', 'cs_7'],
      ['status', 'pending'],
    ])
  })

  it('🔴 NEVER touches a payment still in flight', async () => {
    // A delayed-notification ticket (ACH, Cash App, a bank redirect) is ALSO `pending`, marked only
    // by payment_processing_at. Flipping one would cancel a seat somebody is mid-way through paying
    // for. Without this predicate the guard cannot tell the two apart.
    await abandonTicketFromSession(session('ticket'))
    expect(calls[0].isNull).toContain('payment_processing_at')
  })

  it('no-ops on a session that is not a ticket', async () => {
    for (const kind of ['tip', 'space_donation', 'commerce_order', 'space_membership']) {
      await abandonTicketFromSession(session(kind))
    }
    expect(calls).toHaveLength(0)
  })

  it('no-ops on a session with no metadata kind at all', async () => {
    await abandonTicketFromSession({ id: 'cs_x', metadata: {} } as unknown as Stripe.Checkout.Session)
    expect(calls).toHaveLength(0)
  })
})

describe('abandonTipFromSession', () => {
  it('releases a pending tip as failed, keyed on the session', async () => {
    await abandonTipFromSession(session('tip'))
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('tips')
    // tips_status_check allows pending|succeeded|failed|refunded — `abandoned` is not a value here.
    expect(calls[0].values).toEqual({ status: 'failed' })
  })

  it('is idempotent: pending only', async () => {
    await abandonTipFromSession(session('tip', 'cs_9'))
    expect(calls[0].eq).toEqual([
      ['stripe_checkout_session_id', 'cs_9'],
      ['status', 'pending'],
    ])
  })

  it('no-ops on a session that is not a tip', async () => {
    for (const kind of ['ticket', 'space_donation', 'commerce_order']) {
      await abandonTipFromSession(session(kind))
    }
    expect(calls).toHaveLength(0)
  })
})

describe('the two arms cannot be confused for each other', () => {
  it('each writes only its own table, even given the other kind', async () => {
    await abandonTicketFromSession(session('tip'))
    await abandonTipFromSession(session('ticket'))
    expect(calls).toHaveLength(0)
  })
})
