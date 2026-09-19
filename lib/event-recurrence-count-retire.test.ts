import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── LIVE-338 / ADR-1422: A SPENT COUNT=1 SERIES RETIRES THE DATES IT NO LONGER PRODUCES ─────────
//
// `retireStaleOccurrences` used to stand down on `expected.length === 0`. That guard exists for a
// good reason: an unreadable rule must not be treated as "this series expects no dates". The
// trouble is a COUNT=1 series reaches that length honestly — the expander excludes the anchor,
// which is the only landing — so leftover future children from a reduced count were never retired.
//
// These tests drive the real function and read the DELETE payload. A source-shape check that the
// stand-down mentions "unreadable" is the backlog probe, not coverage of the consequence.

type Call = { table: string; op: string; args: unknown[] }
const calls: Call[] = []

let anchorRow: Record<string, unknown> | null = null
let childRows: { id: string; starts_at: string | null }[] = []
let deletedIds: string[] = []

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
      const ids = (inOp?.args[1] as string[] | undefined) ?? []
      deletedIds = ids
      return { data: ids.map((id) => ({ id })), error: null }
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

import { retireStaleOccurrences } from './event-recurrence'

function countOneAnchor(over: Record<string, unknown> = {}) {
  return {
    id: 'anchor-count-1',
    title: 'One night',
    slug: 'one-night',
    starts_at: '2026-01-07T18:00:00.000Z',
    ends_at: '2026-01-07T19:30:00.000Z',
    recurrence_type: 'weekly',
    recurrence_until: null,
    recurrence_rule: 'FREQ=WEEKLY;COUNT=1',
    is_cancelled: false,
    removed_at: null,
    host_id: null,
    scope_id: 'space-1',
    scope_type: 'space',
    location: null,
    description: null,
    ...over,
  }
}

beforeEach(() => {
  calls.length = 0
  childRows = []
  deletedIds = []
  anchorRow = null
})

const deletes = () => calls.filter((c) => c.op === 'delete')

describe('retireStaleOccurrences — COUNT=1 leftover dates retire (LIVE-338)', () => {
  it('🔴 retires future children a reduced COUNT=1 series no longer produces', async () => {
    // Host cut the series from "after 4 times" to "after 1 time". The expander's child set is
    // empty (the only landing is the excluded anchor). That used to stand down. The leftover
    // dates are in 2099 so this does not depend on the wall clock the function reads.
    anchorRow = countOneAnchor()
    childRows = [
      { id: 'leftover-1', starts_at: '2099-01-14T18:00:00.000Z' },
      { id: 'leftover-2', starts_at: '2099-01-21T18:00:00.000Z' },
    ]

    const result = await retireStaleOccurrences('anchor-count-1')

    expect(result).toEqual({ retired: 2, kept: 0, stoodDown: false })
    expect(deletes()).toHaveLength(1)
    expect(deletedIds).toEqual(['leftover-1', 'leftover-2'])
  })

  it('POSITIVE CONTROL: an unparseable starts_at still stands down and deletes nothing', async () => {
    // Without this the test above would pass on a function that never stands down.
    anchorRow = countOneAnchor({ starts_at: 'not a date', recurrence_rule: 'FREQ=WEEKLY;COUNT=6' })
    childRows = [{ id: 'keep-me', starts_at: '2099-01-14T18:00:00.000Z' }]

    const result = await retireStaleOccurrences('anchor-count-1')

    expect(result).toEqual({ retired: 0, kept: 0, stoodDown: true })
    expect(deletes()).toHaveLength(0)
    expect(deletedIds).toEqual([])
  })

  it('turning a series off still retires every unattached future date', async () => {
    anchorRow = countOneAnchor({ recurrence_type: 'none', recurrence_rule: null })
    childRows = [{ id: 'off-1', starts_at: '2099-01-14T18:00:00.000Z' }]

    const result = await retireStaleOccurrences('anchor-count-1')

    expect(result.stoodDown).toBe(false)
    expect(result.retired).toBe(1)
    expect(deletedIds).toEqual(['off-1'])
  })
})
