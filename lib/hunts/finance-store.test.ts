// FH-040: the finance store against a fake service-role client: it writes only hunt_reconciliation.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Rows = Record<string, unknown[]>
let tables: Rows = {}
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
const writes: { table: string; row: unknown }[] = []

function builder(table: string) {
  let filtered = () => (tables[table] ?? []) as Record<string, unknown>[]
  const q: Record<string, unknown> = {}
  const chain = () => q
  Object.assign(q, {
    select: (_c?: string, opts?: { head?: boolean }) => { if (opts?.head) (q as { head?: boolean }).head = true; return q },
    eq: (col: string, val: unknown) => { const prev = filtered; filtered = () => prev().filter((r) => r[col] === val); return q },
    in: (col: string, vals: unknown[]) => { const prev = filtered; filtered = () => prev().filter((r) => vals.includes(r[col])); return q },
    order: chain, limit: chain,
    maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
    upsert: async (row: unknown) => { writes.push({ table, row }); return { error: null } },
    then: (res: (v: unknown) => unknown) => res({ data: filtered(), count: filtered().length, error: null }),
  })
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return { data: 'created', error: null } },
  }),
}))

const binding = { id: 'b1', hunt_id: 'h1', version_id: 'v1', event_id: 'e1', ticket_type_id: 't1', seller_space_id: 's1', benefit_codes: ['pass'], revision: 1, status: 'active' }
const ticket = { id: 'tk1', event_id: 'e1', ticket_type_id: 't1', buyer_profile_id: 'p1', qty: 2, amount_cents: 9000, platform_fee_cents: 450, currency: 'usd', status: 'succeeded', refunded_at: null, created_at: '2026-11-10T00:00:00Z' }

beforeEach(() => {
  rpcCalls.length = 0
  writes.length = 0
  tables = {
    hunt_pass_bindings: [binding],
    event_tickets: [ticket],
    events: [{ id: 'e1', space_id: 'sx', host_space_id: 's1' }],
    event_rsvps: [{ from_ticket_id: 'tk1', profile_id: 'p1' }],
    event_ticket_types: [{ id: 't1', price_cents: 4500 }],
    hunt_entitlements: [],
  }
})

describe('finance store', () => {
  it('reconciles a ticket into one hunt_reconciliation row, matched when the amounts agree', async () => {
    const { reconcileTicket } = await import('./finance-store')
    expect(await reconcileTicket('tk1', Date.parse('2026-11-10T01:00:00Z'))).toBe('matched')
    expect(writes).toHaveLength(1)
    expect(writes[0].table).toBe('hunt_reconciliation')
    expect(writes[0].row).toMatchObject({ source_type: 'event-ticket', source_id: 'tk1', seller_space_id: 's1', expected_amount_minor: 9000, provider_amount_minor: 9000, status: 'matched' })
  })

  it('flags a ticket whose booked amount differs from the canonical price', async () => {
    tables.event_tickets = [{ ...ticket, amount_cents: 100 }]
    const { reconcileTicket } = await import('./finance-store')
    expect(await reconcileTicket('tk1')).toBe('exception')
  })
})
