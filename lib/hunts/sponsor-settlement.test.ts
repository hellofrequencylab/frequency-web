// FH-047S: the sponsor settlement against a fake service-role client that keeps the same uniqueness the
// database does (one snapshot per agreement, one settlement per snapshot). Event replay and a fraud
// correction after the freeze must not invoice twice, an unpaid pledge is never donations raised, and
// without the D8 approval nothing freezes and nothing is invoiced.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
const writes: string[] = []
const reads: string[] = []

function builder(table: string) {
  let filter = (r: Row) => !!r
  let patch: Row | null = null
  let window: [number, number] | null = null
  const q: Record<string, unknown> = {}
  const rows = () => (tables[table] ?? []).filter(filter)
  const run = () => {
    if (patch) for (const r of rows()) Object.assign(r, patch)
    const all = rows().map((r) => ({ ...r }))
    return { data: window ? all.slice(window[0], window[1] + 1) : all, error: null }
  }
  Object.assign(q, {
    select: () => { reads.push(table); return q },
    eq: (col: string, val: unknown) => { const prev = filter; filter = (r) => prev(r) && r[col] === val; return q },
    in: (col: string, vals: unknown[]) => { const prev = filter; filter = (r) => prev(r) && vals.includes(r[col]); return q },
    order: () => q,
    limit: () => q,
    range: (from: number, to: number) => { window = [from, to]; return q },
    update: (p: Row) => { writes.push(table); patch = p; return q },
    upsert: async (row: Row, opts: { onConflict: string; ignoreDuplicates?: boolean }) => {
      writes.push(table)
      const list = (tables[table] ??= [])
      // unique (snapshot_id), do nothing on conflict: exactly what the database does.
      if (!list.some((r) => r[opts.onConflict] === row[opts.onConflict])) list.push({ id: `st${list.length + 1}`, invoice_ref: null, provider_ref: null, paid_at: null, ...row })
      return { error: null }
    },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => res(run()),
  })
  return q
}

// hunt_sponsor_freeze as the migration writes it: insert once per agreement, else return the first snapshot.
async function rpc(fn: string, args: Record<string, unknown>) {
  if (fn !== 'hunt_sponsor_freeze') return { data: null, error: { message: `unexpected ${fn}` } }
  const list = (tables.hunt_sponsor_snapshots ??= [])
  let s = list.find((r) => r.agreement_id === args.p_agreement_id)
  const created = !s
  if (!s) {
    s = { id: `sn${list.length + 1}`, agreement_id: args.p_agreement_id, hunt_ends_at: args.p_hunt_ends_at, qualification_keys: args.p_keys, owed_cents: args.p_owed_cents }
    list.push(s)
  }
  return { data: { snapshot_id: s.id, owed_cents: s.owed_cents, created }, error: null }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t), rpc }) }))

const NOW = Date.parse('2026-12-01T12:00:00Z')
const ENDS = '2026-12-31T00:00:00Z'
const agreement = {
  id: 'ag1', hunt_id: 'h1', sponsor_label: 'Harbor Hardware', threshold: 3, cap_cents: 50_000,
  pledge_numerator: 75_000, pledge_denominator: 1, status: 'active', approved_at: '2026-11-20T00:00:00Z', approved_by: 'p9',
}
const run = (n: number, extra: Row = {}): Row => ({ id: `r${n}`, hunt_id: 'h1', subject_profile_id: `p${n}`, state: 'completed', ...extra })
const paidInvoice = (extra: Row = {}) => ({ id: 'in_1', metadata: { hunt_sponsor_settlement_id: 'st1' }, status: 'paid' as const, amount_paid: 50_000, currency: 'usd', ...extra })

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', 'on')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  writes.length = 0
  reads.length = 0
  tables = {
    hunts: [{ id: 'h1', status: 'live', current_version_id: 'v1' }],
    hunt_versions: [{ id: 'v1', ends_at: ENDS }],
    hunt_sponsor_agreements: [{ ...agreement }],
    hunt_sponsor_snapshots: [],
    hunt_sponsor_settlements: [],
    hunt_runs: [run(1), run(2), run(3)],
    hunt_claims: [],
    hunt_progress: [],
  }
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const lib = () => import('./sponsor-settlement')

describe('confirmedQualificationKeys', () => {
  it('counts one key per person, only for completed runs with nothing waiting and nothing reversed', async () => {
    tables.hunt_runs = [
      run(1),
      run(2, { subject_profile_id: 'p1' }), // the same person, a second attempt
      run(3, { state: 'active' }),
      run(4), // a claim still held for review
      run(5), // a credit reversed for fraud
      run(6),
      run(7, { hunt_id: 'another-hunt' }),
    ]
    tables.hunt_claims = [{ id: 'c1', hunt_id: 'h1', run_id: 'r4', state: 'needs_review' }, { id: 'c2', hunt_id: 'h1', run_id: 'r6', state: 'accepted' }]
    tables.hunt_progress = [{ hunt_id: 'h1', run_id: 'r5', mission_key: 'm1', disposition: 'reversed' }]
    const { confirmedQualificationKeys } = await lib()
    expect(await confirmedQualificationKeys('h1')).toEqual(['profile:p1', 'profile:p6'])
  })

  it('reads past the first page instead of counting a truncated list', async () => {
    tables.hunt_runs = Array.from({ length: 1001 }, (_, i) => run(i))
    const { confirmedQualificationKeys } = await lib()
    expect(await confirmedQualificationKeys('h1')).toHaveLength(1001)
  })
})

describe('without the approval nothing happens', () => {
  it.each([
    ['not_approved', { approved_by: null }],
    ['not_approved', { approved_at: null }],
    ['not_active', { status: 'draft' }],
    ['not_active', { status: 'void' }],
  ])('%s: no snapshot and no invoice', async (step, patch) => {
    Object.assign(tables.hunt_sponsor_agreements[0], patch)
    const { settleSponsorMilestone, sponsorMoneyLines } = await lib()
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step })
    expect(tables.hunt_sponsor_snapshots).toEqual([])
    expect(tables.hunt_sponsor_settlements).toEqual([])
    expect(writes).toEqual([])
    expect(await sponsorMoneyLines('h1', 0)).toBeNull()
  })

  it('never invoices a snapshot whose agreement lost its approval after the freeze', async () => {
    tables.hunt_sponsor_snapshots = [{ id: 'sn1', agreement_id: 'ag1', owed_cents: 50_000 }]
    tables.hunt_sponsor_agreements[0].status = 'void'
    const { settleSponsorMilestone } = await lib()
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'not_active' })
    expect(tables.hunt_sponsor_settlements).toEqual([])
  })

  it('reads and writes nothing while the commerce switch is off', async () => {
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    const { settleSponsorMilestone, huntsSponsorPass, huntsAfterInvoicePaid, sponsorMoneyLines } = await lib()
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'switch_off' })
    expect(await huntsSponsorPass(50, NOW)).toBeNull()
    expect(await huntsAfterInvoicePaid(paidInvoice())).toBeNull()
    expect(await sponsorMoneyLines('h1', 0)).toBeNull()
    expect(reads).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('freeze and invoice once', () => {
  it('waits for the threshold, then freezes the capped amount and invoices it', async () => {
    const { settleSponsorMilestone } = await lib()
    tables.hunt_runs = [run(1), run(2)]
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'threshold_not_reached' })
    tables.hunt_runs.push(run(3))
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'invoiced', settlementId: 'st1', amountCents: 50_000, created: true })
    expect(tables.hunt_sponsor_snapshots[0]).toMatchObject({ agreement_id: 'ag1', owed_cents: 50_000, qualification_keys: ['profile:p1', 'profile:p2', 'profile:p3'] })
    expect(tables.hunt_sponsor_settlements).toEqual([expect.objectContaining({ snapshot_id: 'sn1', amount_cents: 50_000, status: 'invoiced' })])
  })

  it('refuses after the Trail ends, on a Trail with no end date, and on a Trail that is not live', async () => {
    const { settleSponsorMilestone } = await lib()
    expect(await settleSponsorMilestone('h1', Date.parse(ENDS))).toEqual({ step: 'after_hunt_end' })
    tables.hunt_versions[0].ends_at = null
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'no_end_date' })
    tables.hunts[0].status = 'paused'
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'hunt_not_live' })
    expect(tables.hunt_sponsor_settlements).toEqual([])
  })

  it('event replay cannot double invoice', async () => {
    const { settleSponsorMilestone, huntsSponsorPass } = await lib()
    const first = await settleSponsorMilestone('h1', NOW)
    const again = await Promise.all([settleSponsorMilestone('h1', NOW), settleSponsorMilestone('h1', NOW + 1000)])
    expect(first).toMatchObject({ step: 'invoiced', created: true })
    for (const r of again) expect(r).toEqual({ step: 'invoiced', settlementId: 'st1', amountCents: 50_000, created: false })
    expect(await huntsSponsorPass(50, NOW)).toEqual({ checked: 1, invoiced: 0, failed: 0 })
    expect(tables.hunt_sponsor_snapshots).toHaveLength(1)
    expect(tables.hunt_sponsor_settlements).toHaveLength(1)
  })

  it('a replay after the freeze but before the invoice was written invoices exactly once', async () => {
    tables.hunt_sponsor_snapshots = [{ id: 'sn1', agreement_id: 'ag1', owed_cents: 41_000 }]
    const { settleSponsorMilestone } = await lib()
    expect(await settleSponsorMilestone('h1', NOW)).toMatchObject({ step: 'invoiced', amountCents: 41_000, created: true })
    expect(await settleSponsorMilestone('h1', NOW)).toMatchObject({ step: 'invoiced', amountCents: 41_000, created: false })
    expect(tables.hunt_sponsor_settlements).toHaveLength(1)
  })

  it('a fraud correction after the freeze cannot re-price or double invoice', async () => {
    const { settleSponsorMilestone } = await lib()
    await settleSponsorMilestone('h1', NOW)
    // Two of the three qualifications are reversed, then five new people finish, then the Trail ends.
    tables.hunt_progress = [
      { hunt_id: 'h1', run_id: 'r1', mission_key: 'm1', disposition: 'reversed' },
      { hunt_id: 'h1', run_id: 'r2', mission_key: 'm1', disposition: 'reversed' },
    ]
    expect(await settleSponsorMilestone('h1', NOW + 60_000)).toEqual({ step: 'invoiced', settlementId: 'st1', amountCents: 50_000, created: false })
    tables.hunt_runs.push(run(4), run(5), run(6), run(7), run(8))
    expect(await settleSponsorMilestone('h1', Date.parse(ENDS) + 1)).toEqual({ step: 'invoiced', settlementId: 'st1', amountCents: 50_000, created: false })
    expect(tables.hunt_sponsor_snapshots).toHaveLength(1)
    expect(tables.hunt_sponsor_snapshots[0].qualification_keys).toEqual(['profile:p1', 'profile:p2', 'profile:p3'])
    expect(tables.hunt_sponsor_settlements).toHaveLength(1)
  })

  it('a correction BEFORE the freeze keeps the threshold unmet', async () => {
    tables.hunt_progress = [{ hunt_id: 'h1', run_id: 'r3', mission_key: 'm1', disposition: 'reversed' }]
    const { settleSponsorMilestone } = await lib()
    expect(await settleSponsorMilestone('h1', NOW)).toEqual({ step: 'threshold_not_reached' })
    expect(tables.hunt_sponsor_snapshots).toEqual([])
  })
})

describe('paid only from the provider, and a pledge is never donations raised', () => {
  it('keeps an unpaid pledge out of donations raised, and a paid one too', async () => {
    const { settleSponsorMilestone, sponsorMoneyLines, huntsAfterInvoicePaid } = await lib()
    expect(await sponsorMoneyLines('h1', 12_300)).toEqual({ sponsorLabel: 'Harbor Hardware', currency: 'USD', donationsRaisedCents: 12_300, sponsorPledgedCents: 0, sponsorPaidCents: 0 })
    await settleSponsorMilestone('h1', NOW)
    expect(await sponsorMoneyLines('h1', 12_300)).toMatchObject({ donationsRaisedCents: 12_300, sponsorPledgedCents: 50_000, sponsorPaidCents: 0 })
    expect(await sponsorMoneyLines('h1', 0)).toMatchObject({ donationsRaisedCents: 0, sponsorPledgedCents: 50_000 })

    expect(await huntsAfterInvoicePaid(paidInvoice())).toBe('paid')
    expect(tables.hunt_sponsor_settlements[0]).toMatchObject({ status: 'paid', provider_ref: 'in_1', invoice_ref: 'in_1' })
    expect(tables.hunt_sponsor_settlements[0].paid_at).toBeTruthy()
    expect(await sponsorMoneyLines('h1', 12_300)).toMatchObject({ donationsRaisedCents: 12_300, sponsorPledgedCents: 0, sponsorPaidCents: 50_000 })
    // A redelivered payment event changes nothing.
    expect(await huntsAfterInvoicePaid(paidInvoice())).toBe('already_paid')
  })

  it.each([
    ['an invoice that is not paid', { status: 'open' }],
    ['a short payment', { amount_paid: 49_999 }],
    ['another currency', { currency: 'eur' }],
    ['a settlement that does not exist', { metadata: { hunt_sponsor_settlement_id: 'missing' } }],
  ])('refuses %s', async (_label, patch) => {
    const { settleSponsorMilestone, huntsAfterInvoicePaid } = await lib()
    await settleSponsorMilestone('h1', NOW)
    expect(await huntsAfterInvoicePaid(paidInvoice(patch))).toBe('refused')
    expect(tables.hunt_sponsor_settlements[0]).toMatchObject({ status: 'invoiced', provider_ref: null })
  })

  it('refuses a second invoice claiming a settlement, and a void settlement stays void', async () => {
    const { settleSponsorMilestone, huntsAfterInvoicePaid } = await lib()
    await settleSponsorMilestone('h1', NOW)
    tables.hunt_sponsor_settlements[0].invoice_ref = 'in_original'
    expect(await huntsAfterInvoicePaid(paidInvoice({ id: 'in_other' }))).toBe('refused')
    tables.hunt_sponsor_settlements[0].invoice_ref = null
    tables.hunt_sponsor_settlements[0].status = 'void'
    expect(await huntsAfterInvoicePaid(paidInvoice())).toBe('refused')
    expect(tables.hunt_sponsor_settlements[0].status).toBe('void')
  })

  it('ignores every invoice that names no settlement (membership dues and the rest)', async () => {
    const { huntsAfterInvoicePaid } = await lib()
    expect(await huntsAfterInvoicePaid(paidInvoice({ metadata: {} }))).toBeNull()
    expect(reads).toEqual([])
  })
})
