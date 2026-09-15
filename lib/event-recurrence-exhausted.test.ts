import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── LIVE-271 / ADR-NNNN: A SERIES THAT HAS RUN OUT IS NOT READ AGAIN ────────────────────────────
//
// 🔴 WHAT THIS FILE MEASURES IS THE READ, NOT THE NAME. A unit test asserting that a predicate
// exists, or that it returns true for a spent rule, proves nothing about the defect: the defect was
// never a wrong answer. `generateOccurrencesForAnchor` was already CORRECT for an exhausted
// COUNT-bounded series — the expander stops at the count, so it minted nothing — it just paid an
// anchor read plus a child-occurrence query to arrive at zero, every day, for the life of the row.
//
// So the fake admin client below records every query the function issues, and the assertions are
// about which ones happen. The positive control in the same describe block is what makes the
// measurement honest: the SAME anchor with its COUNT removed must still read its children, or a
// test that passed because nothing queries anything would read as coverage.

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []

/** The anchor row the next `maybeSingle()` hands back. Set per test. */
let anchorRow: Record<string, unknown> | null = null
/** The children the child-occurrence query hands back. */
let childRows: { id: string; starts_at: string | null }[] = []

/** A chainable, thenable stand-in for one PostgREST query builder. Every method records itself and
 *  returns `this`; the resolution is decided from what was recorded, so the fake does not need to
 *  know the order the function calls things in. */
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
    if (ops.some((o) => o.op === 'upsert')) return { data: [{ id: 'minted-1' }], error: null }
    if (ops.some((o) => o.op === 'eq' && o.args[0] === 'parent_event_id')) return { data: childRows, error: null }
    return { data: [], error: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.then = (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

import { anchorIsExhausted, generateOccurrencesForAnchor, type RecurrenceType } from './event-recurrence'

/** The queries that read a series' materialised children — the round trip this row is about. */
const childReads = () => calls.filter((c) => c.op === 'eq' && c.args[0] === 'parent_event_id' && c.args[1] !== null)
const anchorReads = () => calls.filter((c) => c.op === 'maybeSingle')
const writes = () => calls.filter((c) => c.op === 'upsert' || c.op === 'insert')

/** The columns of an anchor this module's two entry points actually read. */
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

/** An anchor as the ANCHOR_SELECT read returns it. `starts_at` is deliberately in the PAST so the
 *  series is live and in-window under every clock this test will ever run on. */
function anchor(over: Partial<TestAnchor> = {}): TestAnchor {
  return {
    id: 'anchor-1',
    title: 'Six week course',
    slug: 'six-week-course',
    starts_at: '2026-01-07T18:00:00.000Z',
    ends_at: '2026-01-07T19:30:00.000Z',
    recurrence_type: 'weekly',
    recurrence_until: null,
    recurrence_rule: 'FREQ=WEEKLY',
    is_cancelled: false,
    removed_at: null,
    ...over,
  }
}

beforeEach(() => {
  calls.length = 0
  childRows = []
  anchorRow = null
})

describe('generateOccurrencesForAnchor — a COUNT-bounded series that has run out is not read again', () => {
  it('🔴 reads the anchor, then stops: no child-occurrence query and no write', async () => {
    // Six weekly gatherings from 2026-01-07. The last one was 2026-02-11, long past. The anchor
    // filter in generateAllOccurrences selects this row every day, because a COUNT rule carries a
    // NULL recurrence_until by construction and the filter reads that as indefinite.
    anchorRow = anchor({ recurrence_rule: 'FREQ=WEEKLY;COUNT=6' })
    // Even with its dates on the table, nothing may be read: the skip is before the read.
    childRows = [
      { id: 'kid-1', starts_at: '2026-01-14T18:00:00.000Z' },
      { id: 'kid-2', starts_at: '2026-01-21T18:00:00.000Z' },
    ]

    const created = await generateOccurrencesForAnchor('anchor-1')

    expect(created).toBe(0)
    expect(anchorReads()).toHaveLength(1)
    expect(childReads()).toHaveLength(0)
    expect(writes()).toHaveLength(0)
  })

  it('POSITIVE CONTROL: the same anchor WITHOUT the count still reads its children and mints', async () => {
    // Without this the test above would pass on a function that queried nothing at all.
    anchorRow = anchor({ recurrence_rule: 'FREQ=WEEKLY' })

    await generateOccurrencesForAnchor('anchor-1')

    expect(anchorReads()).toHaveLength(1)
    expect(childReads()).toHaveLength(1)
    expect(writes()).toHaveLength(1)
  })

  it('POSITIVE CONTROL: a COUNT series that has NOT run out is untouched by the skip', async () => {
    // The skip may only ever fire on a series with no occurrence left. A live count still mints.
    anchorRow = anchor({ recurrence_rule: 'FREQ=WEEKLY;COUNT=4000' })

    await generateOccurrencesForAnchor('anchor-1')

    expect(childReads()).toHaveLength(1)
    expect(writes()).toHaveLength(1)
  })

  it('a cancelled series is still skipped before the read (the dormancy guard is not displaced)', async () => {
    anchorRow = anchor({ is_cancelled: true })

    expect(await generateOccurrencesForAnchor('anchor-1')).toBe(0)
    expect(childReads()).toHaveLength(0)
  })
})

describe('anchorIsExhausted — FALSE is the fail-safe answer', () => {
  const now = new Date('2026-09-15T00:00:00.000Z')

  it('is true once a COUNT rule has produced all of its dates', () => {
    expect(anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=WEEKLY;COUNT=6' }), now)).toBe(true)
  })

  it('is false while a COUNT rule still has a date left', () => {
    expect(anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=WEEKLY;COUNT=4000' }), now)).toBe(false)
  })

  it('is false for an indefinite series, which is the shape most rows have', () => {
    expect(anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=WEEKLY' }), now)).toBe(false)
    expect(anchorIsExhausted(anchor({ recurrence_rule: null }), now)).toBe(false)
  })

  it('is false for a rule this code cannot read — that is a malformed RRULE, not an ended series', () => {
    // `repeatFor` falls back to the coarse enum, so the rule has to be unreadable AND the mirror
    // has to say 'none' for there to be no rule at all. Either way the answer is false.
    expect(anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=FORTNIGHTLY', recurrence_type: 'none' }), now)).toBe(false)
    expect(anchorIsExhausted(anchor({ recurrence_type: 'none', recurrence_rule: null }), now)).toBe(false)
  })

  it('is false for an unparseable start or an unparseable end', () => {
    expect(anchorIsExhausted(anchor({ starts_at: 'not a date', recurrence_rule: 'FREQ=WEEKLY;COUNT=6' }), now)).toBe(false)
    expect(
      anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=WEEKLY;COUNT=6', recurrence_until: 'not a date' }), now),
    ).toBe(false)
  })

  it('is true for a date-ended series whose end has passed (it agrees with the anchor filter)', () => {
    expect(
      anchorIsExhausted(anchor({ recurrence_rule: 'FREQ=WEEKLY', recurrence_until: '2026-03-01T00:00:00.000Z' }), now),
    ).toBe(true)
  })
})

describe('the skip sits BEFORE the child read, in source order', () => {
  it('🔴 orders the guard ahead of the query it is there to avoid', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'lib/event-recurrence.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function generateOccurrencesForAnchor'))
    const guard = fn.indexOf('anchorIsExhausted(anchor)')
    const read = fn.indexOf(".eq('parent_event_id', anchor.id)")
    expect(guard).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(read)
    // And the guard returns on the spot. A guard that computes the answer and carries on saves
    // nothing.
    expect(fn.slice(guard, fn.indexOf('\n', guard))).toContain('return 0')
  })
})
