import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// MANUAL BILLING AGREEMENTS (ADR-872) — the off-Stripe money memory + reminder ladder.
// Network-free: the supabase admin client is mocked over a tiny row store. Locked here:
//   1. The PURE ladder math: interval extension clamps real calendars; the 30/7/overdue windows
//      are disjoint; every stamp suppresses its own touch and a later window never re-opens an
//      earlier one (idempotent, one notice each).
//   2. recordManualPayment extends paid_through by exactly one interval AND clears all three
//      stamps (the next cycle re-arms).
//   3. One ACTIVE agreement per Space: the create path refuses a second (pre-check AND the
//      23505 race from the partial unique index read as the same refusal).
//   4. The migration's source shape (columns, CHECKs, the partial unique index, service-role-only
//      writes) and the cron being scheduled in vercel.json.

import {
  addInterval,
  parseDateUTC,
  dueBucketFor,
  bucketAgreementsDue,
  formatAgreementRate,
  type AgreementDueFields,
} from './manual-agreement-dates'

// ── A chainable admin-client mock over a tiny agreement store ───────────────────────────────
type Row = Record<string, unknown>
const store: {
  rows: Row[]
  updates: { patch: Row }[]
  forceInsertError: { code?: string; message?: string } | null
} = { rows: [], updates: [], forceInsertError: null }
let nextId = 1

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'space_billing_agreements') throw new Error(`unexpected table ${table}`)
      return makeBuilder()
    },
  }),
}))

function makeBuilder() {
  const eqs: [string, unknown][] = []
  const ltes: [string, string][] = []
  let mode: 'select' | 'insert' | 'update' = 'select'
  let pendingInsert: Row | null = null
  let pendingPatch: Row | null = null

  const matching = () =>
    store.rows.filter(
      (r) => eqs.every(([c, v]) => r[c] === v) && ltes.every(([c, v]) => String(r[c]) <= String(v)),
    )

  const finish = () => {
    if (mode === 'insert') {
      if (store.forceInsertError) return { data: null, error: store.forceInsertError }
      const row = pendingInsert as Row
      const conflict = store.rows.some(
        (r) => r.space_id === row.space_id && r.status === 'active' && row.status === 'active',
      )
      if (conflict) return { data: null, error: { code: '23505', message: 'duplicate key' } }
      const created: Row = {
        id: `a${nextId++}`,
        reminder_30_sent_at: null,
        reminder_7_sent_at: null,
        overdue_notice_sent_at: null,
        ...row,
      }
      store.rows.push(created)
      return { data: created, error: null }
    }
    if (mode === 'update') {
      const rows = matching()
      for (const r of rows) Object.assign(r, pendingPatch)
      store.updates.push({ patch: pendingPatch as Row })
      return { data: rows[0] ?? null, error: null }
    }
    return { data: matching()[0] ?? null, error: null }
  }

  const api: Record<string, unknown> = {}
  Object.assign(api, {
    select: () => api,
    eq: (c: string, v: unknown) => {
      eqs.push([c, v])
      return api
    },
    lte: (c: string, v: string) => {
      ltes.push([c, v])
      return api
    },
    insert: (rows: Row[]) => {
      mode = 'insert'
      pendingInsert = rows[0]
      return api
    },
    update: (patch: Row) => {
      mode = 'update'
      pendingPatch = patch
      return api
    },
    maybeSingle: async () => finish(),
    // agreementsDue awaits the select().lte().eq() chain directly (a list read).
    then: (onFulfilled: (v: unknown) => unknown) => {
      const { data, error } = finish()
      return Promise.resolve(onFulfilled({ data: Array.isArray(data) ? data : matching(), error }))
    },
  })
  return api
}

import {
  createManualAgreement,
  recordManualPayment,
  activeAgreementForSpace,
  agreementsDue,
  stampAgreementTouch,
} from './manual-agreements'

function seedRow(over: Row = {}): Row {
  const row: Row = {
    id: `a${nextId++}`,
    space_id: 'space-1',
    plan: 'collective',
    interval: 'year',
    amount_cents: 49000,
    method: 'cash',
    label: null,
    started_at: '2026-07-27',
    paid_through: '2027-07-27',
    reminder_30_sent_at: null,
    reminder_7_sent_at: null,
    overdue_notice_sent_at: null,
    status: 'active',
    note: null,
    ...over,
  }
  store.rows.push(row)
  return row
}

beforeEach(() => {
  store.rows = []
  store.updates = []
  store.forceInsertError = null
})

// ── 1. Pure interval math (UTC calendar days, clamped) ─────────────────────────────────────
describe('addInterval', () => {
  it('adds one year', () => {
    expect(addInterval('2026-07-27', 'year')).toBe('2027-07-27')
  })
  it('adds one month across a year boundary', () => {
    expect(addInterval('2026-12-15', 'month')).toBe('2027-01-15')
  })
  it('clamps Jan 31 + month to the end of February', () => {
    expect(addInterval('2027-01-31', 'month')).toBe('2027-02-28')
    expect(addInterval('2024-01-31', 'month')).toBe('2024-02-29') // leap year keeps the 29th
  })
  it('clamps Feb 29 + year to Feb 28', () => {
    expect(addInterval('2024-02-29', 'year')).toBe('2025-02-28')
  })
  it('rejects malformed and impossible dates', () => {
    expect(addInterval('2027-02-30', 'year')).toBeNull()
    expect(addInterval('not-a-date', 'month')).toBeNull()
    expect(parseDateUTC('2027-13-01')).toBeNull()
  })
})

describe('formatAgreementRate', () => {
  it('drops cents on whole dollars and keeps them otherwise', () => {
    expect(formatAgreementRate(49000, 'year')).toBe('$490 a year')
    expect(formatAgreementRate(4950, 'month')).toBe('$49.50 a month')
  })
})

// ── 2. The due-bucket ladder (disjoint windows, stamps suppress) ────────────────────────────
function dueFields(over: Partial<AgreementDueFields> = {}): AgreementDueFields {
  return {
    status: 'active',
    paidThrough: '2027-07-27',
    reminder30SentAt: null,
    reminder7SentAt: null,
    overdueNoticeSentAt: null,
    ...over,
  }
}

const at = (iso: string) => new Date(iso)

describe('dueBucketFor', () => {
  it('is quiet more than 30 days out', () => {
    expect(dueBucketFor(dueFields(), at('2027-06-26T12:00:00Z'))).toBeNull()
  })
  it('opens the 30-day window exactly 30 days before the due date', () => {
    expect(dueBucketFor(dueFields(), at('2027-06-27T00:00:00Z'))).toBe('reminder_30')
    expect(dueBucketFor(dueFields(), at('2027-07-10T00:00:00Z'))).toBe('reminder_30')
  })
  it('the 30-day stamp suppresses a repeat', () => {
    expect(
      dueBucketFor(dueFields({ reminder30SentAt: '2027-06-27T04:10:00Z' }), at('2027-07-01T00:00:00Z')),
    ).toBeNull()
  })
  it('opens the 7-day window at due-7d, and never fires the 30-day touch inside it', () => {
    // reminder_30 was never sent, but the 7-day window owns this stretch: the more urgent touch
    // covers it (windows are disjoint, so a missed touch is skipped, not sent late).
    expect(dueBucketFor(dueFields(), at('2027-07-20T00:00:00Z'))).toBe('reminder_7')
    expect(dueBucketFor(dueFields(), at('2027-07-26T23:59:59Z'))).toBe('reminder_7')
  })
  it('the 7-day stamp suppresses a repeat without re-opening the 30-day rung', () => {
    expect(
      dueBucketFor(dueFields({ reminder7SentAt: '2027-07-20T04:10:00Z' }), at('2027-07-22T00:00:00Z')),
    ).toBeNull()
  })
  it('goes overdue at the due date, once', () => {
    expect(dueBucketFor(dueFields(), at('2027-07-27T00:00:00Z'))).toBe('overdue')
    expect(dueBucketFor(dueFields(), at('2027-09-01T00:00:00Z'))).toBe('overdue')
    expect(
      dueBucketFor(dueFields({ overdueNoticeSentAt: '2027-07-27T04:10:00Z' }), at('2027-08-01T00:00:00Z')),
    ).toBeNull()
  })
  it('only an active agreement is ever due', () => {
    expect(dueBucketFor(dueFields({ status: 'canceled' }), at('2027-07-28T00:00:00Z'))).toBeNull()
    expect(dueBucketFor(dueFields({ status: 'settled' }), at('2027-07-28T00:00:00Z'))).toBeNull()
  })
  it('a malformed paid_through reminds no one instead of guessing', () => {
    expect(dueBucketFor(dueFields({ paidThrough: 'garbage' }), at('2027-07-28T00:00:00Z'))).toBeNull()
  })
})

describe('bucketAgreementsDue', () => {
  it('splits a batch into the three buckets and drops the not-due', () => {
    const a30 = dueFields({ paidThrough: '2027-08-10' }) // 14 days out at `now` below -> 30-window
    const a7 = dueFields({ paidThrough: '2027-07-30' }) // 3 days out -> 7-window
    const aOver = dueFields({ paidThrough: '2027-07-20' }) // past -> overdue
    const aQuiet = dueFields({ paidThrough: '2027-12-01' }) // far out -> nothing
    const now = at('2027-07-27T12:00:00Z')
    const buckets = bucketAgreementsDue([a30, a7, aOver, aQuiet], now)
    expect(buckets.reminder30).toEqual([a30])
    expect(buckets.reminder7).toEqual([a7])
    expect(buckets.overdue).toEqual([aOver])
  })
})

// ── 3. recordManualPayment extends + re-arms ────────────────────────────────────────────────
describe('recordManualPayment', () => {
  it('extends paid_through by one interval and clears all three stamps', async () => {
    const row = seedRow({
      paid_through: '2027-07-27',
      reminder_30_sent_at: '2027-06-27T04:10:00Z',
      reminder_7_sent_at: '2027-07-20T04:10:00Z',
      overdue_notice_sent_at: '2027-07-28T04:10:00Z',
    })
    const result = await recordManualPayment(row.id as string)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.agreement.paidThrough).toBe('2028-07-27')
      expect(result.agreement.reminder30SentAt).toBeNull()
      expect(result.agreement.reminder7SentAt).toBeNull()
      expect(result.agreement.overdueNoticeSentAt).toBeNull()
    }
    const patch = store.updates[0]?.patch
    expect(patch?.paid_through).toBe('2028-07-27')
    expect(patch?.reminder_30_sent_at).toBeNull()
    expect(patch?.reminder_7_sent_at).toBeNull()
    expect(patch?.overdue_notice_sent_at).toBeNull()
  })
  it('a monthly agreement extends by one month', async () => {
    const row = seedRow({ interval: 'month', paid_through: '2027-01-31' })
    const result = await recordManualPayment(row.id as string)
    expect(result.ok && result.agreement.paidThrough).toBe('2027-02-28')
  })
  it('refuses a missing or non-active agreement with no write', async () => {
    const missing = await recordManualPayment('nope')
    expect(missing.ok).toBe(false)
    const row = seedRow({ status: 'settled' })
    const settled = await recordManualPayment(row.id as string)
    expect(settled.ok).toBe(false)
    expect(store.updates).toHaveLength(0)
  })
})

// ── 4. createManualAgreement: validation + one-active-per-space ─────────────────────────────
describe('createManualAgreement', () => {
  const input = {
    spaceId: 'space-1',
    plan: 'collective',
    interval: 'year',
    amountCents: 49000,
    method: 'cash',
    label: 'Grandfathered at $49/mo ($490/yr), normally $79',
    startedAt: '2026-07-27',
    paidThrough: '2027-07-27',
  }

  it('records the agreement with the locked rate', async () => {
    const result = await createManualAgreement(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.agreement.plan).toBe('collective')
      expect(result.agreement.amountCents).toBe(49000)
      expect(result.agreement.paidThrough).toBe('2027-07-27')
      expect(result.agreement.status).toBe('active')
    }
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].label).toBe(input.label)
  })
  it('refuses a second ACTIVE agreement for the same space (pre-check)', async () => {
    seedRow({ space_id: 'space-1' })
    const result = await createManualAgreement(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already has an active agreement/)
    expect(store.rows).toHaveLength(1)
  })
  it('reads the 23505 race as the same refusal', async () => {
    store.forceInsertError = { code: '23505', message: 'duplicate key' }
    const result = await createManualAgreement(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already has an active agreement/)
  })
  it('a settled history row does not block a new agreement', async () => {
    seedRow({ space_id: 'space-1', status: 'settled' })
    const result = await createManualAgreement(input)
    expect(result.ok).toBe(true)
  })
  it('fails closed on bad input: free plan, bad interval, bad method, fake date, float cents', async () => {
    expect((await createManualAgreement({ ...input, plan: 'free' })).ok).toBe(false)
    expect((await createManualAgreement({ ...input, interval: 'week' })).ok).toBe(false)
    expect((await createManualAgreement({ ...input, method: 'crypto' })).ok).toBe(false)
    expect((await createManualAgreement({ ...input, paidThrough: '2027-02-30' })).ok).toBe(false)
    expect((await createManualAgreement({ ...input, amountCents: 490.5 })).ok).toBe(false)
    expect(store.rows).toHaveLength(0)
  })
})

// ── 5. The batched due read + the stamp write ───────────────────────────────────────────────
describe('agreementsDue / stampAgreementTouch', () => {
  it('buckets the active agreements inside the horizon', async () => {
    seedRow({ id: 'due30', space_id: 's30', paid_through: '2027-08-10' })
    seedRow({ id: 'due7', space_id: 's7', paid_through: '2027-07-30' })
    seedRow({ id: 'over', space_id: 'sov', paid_through: '2027-07-20' })
    seedRow({ id: 'far', space_id: 'sfar', paid_through: '2028-07-27' }) // beyond the lte horizon
    seedRow({ id: 'dead', space_id: 'sded', paid_through: '2027-07-20', status: 'canceled' })
    const buckets = await agreementsDue(new Date('2027-07-27T12:00:00Z'))
    expect(buckets.reminder30.map((a) => a.id)).toEqual(['due30'])
    expect(buckets.reminder7.map((a) => a.id)).toEqual(['due7'])
    expect(buckets.overdue.map((a) => a.id)).toEqual(['over'])
  })
  it('activeAgreementForSpace reads only the active row', async () => {
    seedRow({ space_id: 'space-9', status: 'settled' })
    const active = seedRow({ space_id: 'space-9', paid_through: '2027-07-27' })
    const found = await activeAgreementForSpace('space-9')
    expect(found?.id).toBe(active.id)
    expect(await activeAgreementForSpace('space-none')).toBeNull()
  })
  it('stampAgreementTouch writes exactly the one stamp column', async () => {
    const row = seedRow()
    await stampAgreementTouch(row.id as string, 'reminder_7_sent_at')
    const patch = store.updates[0]?.patch as Row
    expect(typeof patch.reminder_7_sent_at).toBe('string')
    expect(patch.reminder_30_sent_at).toBeUndefined()
    expect(patch.overdue_notice_sent_at).toBeUndefined()
    expect(store.rows[0].reminder_7_sent_at).toBe(patch.reminder_7_sent_at)
  })
})

// ── 6. Migration + schedule source shape ────────────────────────────────────────────────────
describe('migration 20270114000000 (space_billing_agreements) source shape', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20270114000000_space_billing_agreements.sql'),
    'utf8',
  )

  it('creates the table with every column the data layer reads', () => {
    expect(sql).toMatch(/create table if not exists public\.space_billing_agreements/)
    for (const col of [
      'space_id',
      'plan',
      'interval',
      'amount_cents',
      'method',
      'label',
      'started_at',
      'paid_through',
      'reminder_30_sent_at',
      'reminder_7_sent_at',
      'overdue_notice_sent_at',
      'status',
      'note',
      'created_at',
      'updated_at',
    ]) {
      expect(sql, `column ${col}`).toMatch(new RegExp(`^\\s*${col}\\s`, 'm'))
    }
    expect(sql).toMatch(/references public\.spaces\(id\) on delete cascade/)
  })
  it('CHECK-constrains the enums and the amount', () => {
    expect(sql).toMatch(/plan in \('business', 'collective', 'nonprofit', 'independent'\)/)
    expect(sql).toMatch(/interval in \('month', 'year'\)/)
    expect(sql).toMatch(/method in \('cash', 'check', 'transfer', 'other'\)/)
    expect(sql).toMatch(/status in \('active', 'canceled', 'settled'\)/)
    expect(sql).toMatch(/amount_cents >= 0/)
  })
  it('enforces ONE active agreement per space via the partial unique index', () => {
    expect(sql).toMatch(
      /create unique index if not exists space_billing_agreements_one_active_idx\s+on public\.space_billing_agreements \(space_id\)\s+where status = 'active'/,
    )
  })
  it('enables RLS with read-only policies (writes stay service-role only)', () => {
    expect(sql).toMatch(/alter table public\.space_billing_agreements enable row level security/)
    expect(sql).toMatch(/for select to authenticated/)
    expect(sql).not.toMatch(/for (insert|update|delete)/)
  })
})

describe('billing-renewals cron is scheduled', () => {
  it('vercel.json carries the daily entry', () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    const entry = vercel.crons.find((c) => c.path === '/api/cron/billing-renewals')
    expect(entry).toBeDefined()
    expect(entry?.schedule).toBe('10 4 * * *')
  })
})
