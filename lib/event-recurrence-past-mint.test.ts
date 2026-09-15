import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── LIVE-337 / ADR-NNNN: THE MATERIALISER NEVER WRITES HISTORY ──────────────────────────────────
//
// 🔴 WHAT THIS FILE MEASURES IS THE UPSERT PAYLOAD, NOT THE BOUND. A test that asserts
// `computeOccurrenceDates` has a `from` argument proves the spelling and nothing else: the defect
// was a row appearing in the database, so the measurement is which rows the function tries to
// write.
//
// The fake admin client below records every query AND keeps the payload of every upsert, so each
// case reads as "these days were offered to the database, and these were not". Both directions are
// pinned in the same block, because a bound that suppressed everything would pass the headline
// assertion on its own:
//
//   · a HARD-DELETED PAST occurrence must NOT be offered (the defect), and
//   · a genuinely missing FUTURE one — including one LATER TODAY, the nearest date the floor still
//     repairs — must still be offered (the control).
//
// The deliberate limit is pinned too (an occurrence EARLIER today is abandoned, not repaired), so
// moving the floor has to argue with a failing test rather than sliding past one.

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []
/** Every row payload handed to `.upsert()`, flattened. */
const upserted: Record<string, unknown>[] = []

let anchorRow: Record<string, unknown> | null = null
let childRows: { id: string; starts_at: string | null }[] = []

function makeQuery(table: string) {
  const ops: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {}
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      const call = { table, op, args }
      ops.push(call)
      calls.push(call)
      if (op === 'upsert') {
        for (const row of (args[0] ?? []) as Record<string, unknown>[]) upserted.push(row)
      }
      return q
    }
  for (const op of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'gt', 'neq', 'or', 'order', 'limit', 'update', 'delete', 'insert', 'upsert']) {
    q[op] = record(op)
  }
  q.maybeSingle = async () => {
    calls.push({ table, op: 'maybeSingle', args: [] })
    return { data: anchorRow, error: null }
  }
  const resolve = () => {
    if (ops.some((o) => o.op === 'upsert')) {
      return { data: upserted.map((_, i) => ({ id: `minted-${i}` })), error: null }
    }
    if (ops.some((o) => o.op === 'eq' && o.args[0] === 'parent_event_id')) {
      return { data: childRows, error: null }
    }
    // event_ticket_types: no tiers on the anchor, so the tier copy returns early (ADR-1308).
    return { data: [], error: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.then = (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

import {
  computeOccurrenceDates,
  expandOccurrenceInstants,
  generateOccurrencesForAnchor,
  staleOccurrenceIds,
  type RecurrenceType,
} from './event-recurrence'

/** The cron fires at 02:00 UTC (vercel.json), so that is the hour every case is measured at: it is
 *  the one moment of the day when "earlier today" and "later today" are both real. */
const NOW = new Date('2026-09-15T02:00:00.000Z')

/** The days the run offered to the database, ascending. */
const offeredDays = () => upserted.map((r) => String(r.starts_at).slice(0, 10)).sort()

const day = (d: Date) => d.toISOString().slice(0, 10)

type TestAnchor = {
  id: string
  title: string
  slug: string
  starts_at: string
  ends_at: string | null
  recurrence_type: RecurrenceType
  recurrence_until: string | null
  recurrence_rule: string | null
  is_cancelled: boolean
  removed_at: string | null
}

/** The live shape, copied from production (2026-09-15): `breathe-connect-expand`, a legacy weekly
 *  enum series with a NULL rule whose anchor is two months in the past. */
function weeklyAnchor(over: Partial<TestAnchor> = {}): TestAnchor {
  return {
    id: 'anchor-1',
    title: 'Breathe, Connect, Expand',
    slug: 'breathe-connect-expand',
    starts_at: '2026-07-16T18:30:00.000Z',
    ends_at: '2026-07-16T20:00:00.000Z',
    recurrence_type: 'weekly',
    recurrence_until: null,
    recurrence_rule: null,
    is_cancelled: false,
    removed_at: null,
    ...over,
  }
}

/** Children for every day in `days`, so a test can state the hole by omission. */
function childrenFor(days: string[], timeOfDay = 'T18:30:00.000Z') {
  return days.map((d, i) => ({ id: `kid-${i}`, starts_at: `${d}${timeOfDay}` }))
}

/** Every Thursday the weekly anchor produces, either side of the 2026-09-15 floor. */
const THURSDAYS_PAST = [
  '2026-07-23',
  '2026-07-30',
  '2026-08-06',
  '2026-08-13',
  '2026-08-20',
  '2026-08-27',
  '2026-09-03',
  '2026-09-10',
]
const THURSDAYS_FUTURE = [
  '2026-09-17',
  '2026-09-24',
  '2026-10-01',
  '2026-10-08',
  '2026-10-15',
  '2026-10-22',
  '2026-10-29',
  '2026-11-05',
  '2026-11-12',
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  calls.length = 0
  upserted.length = 0
  childRows = []
  anchorRow = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('generateOccurrencesForAnchor — a hard-deleted PAST occurrence is not re-minted', () => {
  it('🔴 offers the missing FUTURE day and NOT the deleted past one (both directions, one run)', async () => {
    anchorRow = weeklyAnchor()
    // The operator hard-deleted 2026-08-20 (`deleteEvent`, a real in-product action) and the
    // 2026-10-01 date is genuinely missing — a hole the materialiser SHOULD fill.
    childRows = childrenFor([
      ...THURSDAYS_PAST.filter((d) => d !== '2026-08-20'),
      ...THURSDAYS_FUTURE.filter((d) => d !== '2026-10-01'),
    ])

    const created = await generateOccurrencesForAnchor('anchor-1')

    expect(offeredDays()).toEqual(['2026-10-01'])
    expect(offeredDays()).not.toContain('2026-08-20')
    expect(created).toBe(1)
    // And the row it did offer is a real occurrence row, not a bare date: the day-keyed slug is
    // what the upsert conflicts on, so a wrong one would double-insert instead of deduping.
    expect(upserted[0].slug).toBe('breathe-connect-expand-2026-10-01')
    expect(upserted[0].parent_event_id).toBe('anchor-1')
  })

  it('🔴 writes NOTHING AT ALL when the only hole is in the past', async () => {
    anchorRow = weeklyAnchor()
    childRows = childrenFor([...THURSDAYS_PAST.filter((d) => d !== '2026-08-20'), ...THURSDAYS_FUTURE])

    const created = await generateOccurrencesForAnchor('anchor-1')

    expect(created).toBe(0)
    expect(calls.filter((c) => c.op === 'upsert')).toHaveLength(0)
    // The run still READ the children: the floor is a bound on what may be written, not a reason to
    // skip the anchor (that is ADR-1348's guard, and it is a different question).
    expect(calls.filter((c) => c.op === 'eq' && c.args[0] === 'parent_event_id')).not.toHaveLength(0)
  })

  it('POSITIVE CONTROL: with every past date deleted, still exactly the future hole', async () => {
    // Without this, the case above would pass on a function that had stopped writing anything.
    anchorRow = weeklyAnchor()
    childRows = childrenFor(THURSDAYS_FUTURE.filter((d) => d !== '2026-09-24'))

    await generateOccurrencesForAnchor('anchor-1')

    expect(offeredDays()).toEqual(['2026-09-24'])
  })

  it('POSITIVE CONTROL: a series with no children at all still materialises its whole window', async () => {
    anchorRow = weeklyAnchor()
    childRows = []

    await generateOccurrencesForAnchor('anchor-1')

    // Every FUTURE Thursday to the horizon, and not one of the eight past ones.
    expect(offeredDays()).toEqual(THURSDAYS_FUTURE)
  })
})

describe('the floor is `now`, so TODAY is split by the hour the run happens', () => {
  /** A daily series at 18:30 — later than the 02:00 run, so today is still ahead of the floor. */
  const laterToday = () =>
    weeklyAnchor({
      starts_at: '2026-09-01T18:30:00.000Z',
      ends_at: '2026-09-01T20:00:00.000Z',
      recurrence_type: 'daily',
      recurrence_until: '2026-09-17T23:59:59.000Z',
    })

  /** The same series at 01:00 — EARLIER than the run, so today has already gone below the floor. */
  const earlierToday = () =>
    weeklyAnchor({
      starts_at: '2026-09-01T01:00:00.000Z',
      ends_at: '2026-09-01T02:00:00.000Z',
      recurrence_type: 'daily',
      recurrence_until: '2026-09-17T23:59:59.000Z',
    })

  it('✅ repairs a date LATER TODAY — the nearest repairable date there is', async () => {
    anchorRow = laterToday()
    childRows = childrenFor(['2026-09-16', '2026-09-17'])

    await generateOccurrencesForAnchor('anchor-1')

    expect(offeredDays()).toContain('2026-09-15')
  })

  it('⚠️ DELIBERATELY does not repair a date EARLIER TODAY (what the bound gives up)', async () => {
    // This is the judgement call, pinned so that moving the floor breaks a test and has to argue
    // with it. A 01:00 gathering is over by the time the 02:00 run looks; minting a page for it
    // would be writing history, and it is indistinguishable from an operator having deleted it.
    anchorRow = earlierToday()
    childRows = childrenFor(['2026-09-16', '2026-09-17'], 'T01:00:00.000Z')

    await generateOccurrencesForAnchor('anchor-1')

    expect(offeredDays()).not.toContain('2026-09-15')

    // Control in the same case: tomorrow's hole in the SAME series is still repaired.
    childRows = childrenFor(['2026-09-17'], 'T01:00:00.000Z')
    upserted.length = 0
    await generateOccurrencesForAnchor('anchor-1')
    expect(offeredDays()).toEqual(['2026-09-16'])
  })
})

describe('computeOccurrenceDates — the window is [now, now + horizonDays]', () => {
  it('drops every date before `now` and keeps a date exactly AT it (inclusive floor)', () => {
    // A daily series whose landing time is the floor to the millisecond. The floor is inclusive, so
    // that date is still the materialiser's to write — which is what makes the handover to
    // retirement seamless (see the next case).
    const dates = computeOccurrenceDates(
      { starts_at: '2026-09-01T02:00:00.000Z', recurrence_type: 'daily', recurrence_until: null },
      3,
      NOW,
    )
    expect(dates.map(day)).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])
  })

  it('shares its boundary with the retirement pass, with no gap and no overlap', () => {
    // ADR-1304 runs retirement ahead of generation in the same loop and the module calls them "the
    // same window read the same way". They now are: `staleOccurrenceIds` judges a child from `now`
    // inclusive, and the expansion starts at `now` inclusive, so no date falls between the two.
    const atFloor = { id: 'at-floor', starts_at: '2026-09-15T02:00:00.000Z' }
    const belowFloor = { id: 'below-floor', starts_at: '2026-09-15T01:59:59.999Z' }
    const produced = computeOccurrenceDates(
      { starts_at: '2026-09-01T02:00:00.000Z', recurrence_type: 'daily', recurrence_until: null },
      3,
      NOW,
    )

    // The date AT the floor is produced by generation, so retirement must not call it stale.
    expect(produced.some((d) => d.getTime() === new Date(atFloor.starts_at).getTime())).toBe(true)
    expect(staleOccurrenceIds([atFloor], produced, NOW)).toEqual([])
    // The date below it is outside BOTH: generation will not write it and retirement will not
    // delete it. That is the past, and neither half of the loop touches the past.
    expect(produced.some((d) => d.getTime() < NOW.getTime())).toBe(false)
    expect(staleOccurrenceIds([belowFloor], produced, NOW)).toEqual([])
  })

  it('does not hand a COUNT series back the dates it has already spent', () => {
    // The floor drops a landing from the RESULT but the rule's COUNT still counts it, so a
    // six-week course two thirds of the way through mints its remaining dates and not six fresh
    // ones. (If the floor reset the count, this would read six.)
    const dates = computeOccurrenceDates(
      {
        starts_at: '2026-08-13T18:30:00.000Z',
        recurrence_type: 'weekly',
        recurrence_until: null,
        recurrence_rule: 'FREQ=WEEKLY;COUNT=6',
      },
      60,
      NOW,
    )
    expect(dates.map(day)).toEqual(['2026-09-17'])
  })

  it('expands the FULL window when the floor is unparseable (fail-safe direction)', () => {
    // FALSE-is-fail-safe, the rule this file keeps: when in doubt, DO the work. `expandRepeat`
    // ignores a `from` that is not a valid date, so a floor this code could not compute
    // over-materialises rather than stranding a live series with no dates at all.
    const anchor = {
      starts_at: '2026-09-01T02:00:00.000Z',
      recurrence_type: 'daily' as RecurrenceType,
      recurrence_until: null,
    }
    const horizon = new Date('2026-09-18T02:00:00.000Z')
    const bounded = expandOccurrenceInstants(anchor, horizon, NOW)
    const unbounded = expandOccurrenceInstants(anchor, horizon, new Date('not a date'))

    expect(bounded.map(day)[0]).toBe('2026-09-15')
    // Every date from the anchor, past ones included: the same set the function returned before the
    // bound existed, which is the safe direction to fail in.
    expect(unbounded.map(day)[0]).toBe('2026-09-02')
    expect(unbounded.length).toBeGreaterThan(bounded.length)
  })
})
