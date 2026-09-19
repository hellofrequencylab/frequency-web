import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── LIVE-338 / ADR-1422: A SPENT COUNT=1 SERIES RETIRES LEFTOVER FUTURE DATES ───────────────────
//
// 🔴 WHAT THIS FILE MEASURES IS THE DELETE PAYLOAD, NOT THE TOKEN. A test that asserts
// `retireStaleOccurrences` contains the word "unreadable" proves the spelling and nothing else:
// the defect was leftover future rows staying in the database, so the measurement is which ids
// the function tries to delete, and which cases it refuses to touch.
//
// COUNT=1 is the sharp case because `expandOccurrenceInstants` excludes the anchor: the only
// date the rule produces is already a row, so the child expansion is ALWAYS empty. The old
// stand-down treated that empty array as "could not read the rule" and left every leftover
// child live. An unparseable start is the control that must still stand down.

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []
/** Every id handed to `.delete().in('id', …)` on events. */
const deletedIds: string[] = []

let anchorRow: Record<string, unknown> | null = null
let childRows: { id: string; starts_at: string | null }[] = []
let attachmentError: { message: string } | null = null

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
  for (const op of [
    'select',
    'eq',
    'is',
    'in',
    'gte',
    'lte',
    'gt',
    'neq',
    'or',
    'order',
    'limit',
    'update',
    'delete',
    'insert',
    'upsert',
  ]) {
    q[op] = record(op)
  }
  q.maybeSingle = async () => {
    calls.push({ table, op: 'maybeSingle', args: [] })
    return { data: anchorRow, error: null }
  }
  const resolve = () => {
    if (ops.some((o) => o.op === 'delete')) {
      const inOp = ops.find((o) => o.op === 'in' && o.args[0] === 'id')
      const ids = ((inOp?.args[1] as string[] | undefined) ?? []).slice()
      deletedIds.push(...ids)
      return { data: ids.map((id) => ({ id })), error: null }
    }
    if (table !== 'events') {
      if (attachmentError) return { data: null, error: attachmentError }
      return { data: [], error: null }
    }
    if (ops.some((o) => o.op === 'eq' && o.args[0] === 'parent_event_id')) {
      return { data: childRows, error: null }
    }
    return { data: [], error: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q.then = (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
  return q
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

import { retireStaleOccurrences, type RecurrenceType } from './event-recurrence'

const NOW = new Date('2026-09-16T00:00:00.000Z')

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

function countOneAnchor(over: Partial<TestAnchor> = {}): TestAnchor {
  return {
    id: 'anchor-1',
    title: 'COUNT=1 leftover',
    slug: 'count-one-leftover',
    starts_at: '2026-09-09T18:30:00.000Z',
    ends_at: '2026-09-09T20:00:00.000Z',
    recurrence_type: 'weekly',
    recurrence_until: null,
    recurrence_rule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=1',
    is_cancelled: false,
    removed_at: null,
    ...over,
  }
}

function leftoverChildren() {
  return [
    { id: 'w1', starts_at: '2026-09-23T18:30:00.000Z' },
    { id: 'w2', starts_at: '2026-09-30T18:30:00.000Z' },
  ]
}

beforeEach(() => {
  calls.length = 0
  deletedIds.length = 0
  attachmentError = null
  anchorRow = null
  childRows = []
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('retireStaleOccurrences — COUNT=1 is an empty expansion, not an unreadable rule', () => {
  it('🔴 a spent COUNT=1 series deletes leftover future children', async () => {
    // The host reduced a weekly series to one date. The expander produces no child dates
    // (the anchor is occurrence one and COUNT is spent). Those leftover Wednesdays are the
    // dates ADR-1304 exists to retire.
    anchorRow = countOneAnchor()
    childRows = leftoverChildren()

    const result = await retireStaleOccurrences('anchor-1')

    expect(result).toEqual({ retired: 2, kept: 0, stoodDown: false })
    expect(deletedIds.sort()).toEqual(['w1', 'w2'])
    expect(calls.some((c) => c.op === 'delete')).toBe(true)
  })

  it('an unparseable weekly start still stands down and deletes nothing', async () => {
    anchorRow = countOneAnchor({
      starts_at: 'not-a-date',
      recurrence_rule: null,
    })
    childRows = leftoverChildren()

    const result = await retireStaleOccurrences('anchor-1')

    expect(result).toEqual({ retired: 0, kept: 0, stoodDown: true })
    expect(deletedIds).toEqual([])
    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('a live weekly series whose rule still produces the children deletes nothing', async () => {
    anchorRow = countOneAnchor({
      recurrence_rule: null,
      recurrence_type: 'weekly',
    })
    childRows = leftoverChildren()

    const result = await retireStaleOccurrences('anchor-1')

    expect(result).toEqual({ retired: 0, kept: 0, stoodDown: false })
    expect(deletedIds).toEqual([])
  })

  it('a failed attachment read still stands down rather than deleting on an unknown', async () => {
    anchorRow = countOneAnchor()
    childRows = leftoverChildren()
    attachmentError = { message: 'timeout' }

    const result = await retireStaleOccurrences('anchor-1')

    expect(result.stoodDown).toBe(true)
    expect(result.kept).toBe(2)
    expect(deletedIds).toEqual([])
  })
})
