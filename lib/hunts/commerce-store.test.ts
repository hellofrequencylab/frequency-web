// FH-036/037/040: the IO half, against a fake service-role client. Proves the store only reads canonical
// ticket rows, projects through the database function, repairs a missed projection, and writes only hunt_* rows.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PASS_SEATS } from './pass-binding'

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

describe('commerce store', () => {
  it('caps a purchase at ten seats', () => expect(MAX_PASS_SEATS).toBe(10))

  it('loads a ticket as a canonical source: seller from the host Space, seat 1 to the buyer, the rest unclaimed', async () => {
    const { loadTicketSource } = await import('./commerce-store')
    const s = await loadTicketSource('tk1')
    expect(s).toMatchObject({ id: 'tk1', sellerSpaceId: 's1', qty: 2 })
    expect(s?.seats).toEqual([{ unit: 'seat-1', profileId: 'p1' }, { unit: 'seat-2', profileId: null }])
    expect(await loadTicketSource('missing')).toBeNull()
  })

  it('projects through the database function, one call per seat and code, never writing a ticket', async () => {
    const { projectTicketBenefits } = await import('./commerce-store')
    const out = await projectTicketBenefits('tk1')
    expect(out?.disposition).toBe('projected')
    expect(rpcCalls.map((c) => c.fn)).toEqual(['hunt_entitlement_project', 'hunt_entitlement_project'])
    expect(rpcCalls[0].args).toMatchObject({ p_binding_id: 'b1', p_unit_key: 'seat-1', p_profile_id: 'p1' })
    expect(rpcCalls[1].args).toMatchObject({ p_unit_key: 'seat-2', p_profile_id: null })
    expect(writes).toEqual([])
  })

  it('does nothing for a ticket on an unbound tier', async () => {
    tables.hunt_pass_bindings = []
    const { projectTicketBenefits } = await import('./commerce-store')
    expect(await projectTicketBenefits('tk1')).toBeNull()
    expect(rpcCalls).toEqual([])
  })

  it('looks a binding up by id and by tier', async () => {
    const { bindingById, activeBindingForTier } = await import('./commerce-store')
    expect((await bindingById('b1'))?.benefitCodes).toEqual(['pass'])
    expect((await activeBindingForTier('t1'))?.id).toBe('b1')
    expect(await bindingById('nope')).toBeNull()
  })

  it('repairs a settled ticket whose projection was missed, and skips one already projected', async () => {
    const { repairMissingBenefits } = await import('./commerce-store')
    expect(await repairMissingBenefits()).toEqual({ checked: 1, repaired: 1 })
    rpcCalls.length = 0
    tables.hunt_entitlements = [{ source_id: 'tk1', source_type: 'event-ticket' }]
    expect(await repairMissingBenefits()).toEqual({ checked: 1, repaired: 0 })
    expect(rpcCalls).toEqual([])
  })

  it('attaches a verified attendee and consumes through the same RPC caller', async () => {
    const { huntRpc } = await import('./commerce-store')
    const { attachAttendee } = await import('./entitlements')
    expect(await attachAttendee(huntRpc, 'tk1', 'seat-2', 'p2')).toBe(0)
    expect(rpcCalls[0]).toMatchObject({ fn: 'hunt_entitlement_attach' })
  })
})
