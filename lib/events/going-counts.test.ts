import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-303. What is locked here is the property the /events listing depends on and that the OLD
// code got wrong in two ways at once:
//
//   1. The count must not TRUNCATE. PostgREST caps every response at max_rows (1,000) server-side,
//      so the old `select('event_id').in(…).eq('status','going')` under-counted past 1,000 rows
//      with no error — flipping "Has open spots" ON for a full event. Both paths here must return
//      the true count for a listing whose 'going' rows exceed that cap.
//   2. The RPC half is a MIGRATION that the owner has not applied. So the caller must FAIL SAFE to
//      the counting path when `event_going_counts` does not exist, or merging the migration file
//      ahead of the apply would zero out every count in production.
//
// The fake client below models both PostgREST behaviours faithfully: `.range()` windows are capped
// at 1,000 rows regardless of the window asked for, and an absent RPC returns the PGRST202 error
// shape rather than throwing.

type Rsvp = { id: string; event_id: string; status: string; approval_status?: string }

const state: {
  rsvps: Rsvp[]
  rpcExists: boolean
  rpcCalls: Array<{ fn: string; ids: string[] }>
  rangeCalls: Array<[number, number]>
  rpcThrows: boolean
} = { rsvps: [], rpcExists: true, rpcCalls: [], rangeCalls: [], rpcThrows: false }

const MAX_ROWS = 1000

function builder() {
  const f: { ids?: string[]; status?: string; excludeApproval?: string } = {}
  let lo = 0
  let hi = Number.MAX_SAFE_INTEGER
  const api = {
    select() {
      return api
    },
    in(col: string, vals: string[]) {
      if (col === 'event_id') f.ids = vals
      return api
    },
    eq(col: string, val: string) {
      if (col === 'status') f.status = val
      return api
    },
    // SCAN-105: the fallback excludes approval_status 'pending', so the stub HONOURS the filter
    // rather than merely tolerating it — otherwise adding `neq` would only unblock the chain and
    // prove nothing about which rows the reader asked for.
    neq(col: string, val: string) {
      if (col === 'approval_status') f.excludeApproval = val
      return api
    },
    order() {
      return api
    },
    range(from: number, to: number) {
      state.rangeCalls.push([from, to])
      lo = from
      hi = to
      return api
    },
    then(resolve: (r: { data: { event_id: string }[] | null; error: unknown }) => unknown) {
      const idSet = new Set(f.ids ?? [])
      const rows = state.rsvps
        .filter(
          (r) =>
            idSet.has(r.event_id) &&
            (!f.status || r.status === f.status) &&
            // Ungated rows carry 'none' (the column is NOT NULL DEFAULT 'none' in production), so
            // an undefined approval_status in a fixture reads as 'none' and is counted.
            (!f.excludeApproval || (r.approval_status ?? 'none') !== f.excludeApproval),
        )
        // A stable total order, the same one the reader asks PostgREST for.
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      // PostgREST applies max_rows to the WINDOW, server-side — this is the whole bug.
      const window = rows.slice(lo, Math.min(hi + 1, lo + MAX_ROWS))
      return Promise.resolve(resolve({ data: window.map((r) => ({ event_id: r.event_id })), error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => builder(),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const ids = (args.p_event_ids as string[]) ?? []
      state.rpcCalls.push({ fn, ids })
      if (state.rpcThrows) throw new Error('network')
      if (!state.rpcExists) {
        // The exact pre-apply shape: PostgREST cannot find the function.
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      }
      const idSet = new Set(ids)
      const counts = new Map<string, number>()
      for (const r of state.rsvps) {
        if (!idSet.has(r.event_id) || r.status !== 'going') continue
        counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1)
      }
      return { data: [...counts].map(([event_id, going]) => ({ event_id, going })), error: null }
    },
  }),
}))

import {
  goingCountsByEvent,
  chunkIds,
  normalizeEventIds,
  foldCountRows,
  GOING_ID_CHUNK,
} from './going-counts'

function seed(perEvent: Record<string, number>, status = 'going') {
  const rows: Rsvp[] = []
  let n = 0
  for (const [eventId, count] of Object.entries(perEvent)) {
    for (let i = 0; i < count; i++) {
      rows.push({ id: String(n++).padStart(8, '0'), event_id: eventId, status })
    }
  }
  return rows
}

beforeEach(() => {
  state.rsvps = []
  state.rpcExists = true
  state.rpcCalls = []
  state.rangeCalls = []
  state.rpcThrows = false
})

describe('pure helpers', () => {
  it('normalizeEventIds trims, drops empties, de-dupes, preserves order', () => {
    expect(normalizeEventIds([' a ', 'b', 'a', '', null, undefined, 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('chunkIds never exceeds the chunk size and loses nothing', () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `e${i}`)
    const chunks = chunkIds(ids)
    expect(chunks.every((c) => c.length <= GOING_ID_CHUNK)).toBe(true)
    expect(chunks.flat()).toEqual(ids)
  })

  it('chunk size is small enough that a full RPC response can never be a truncated one', () => {
    // One row per requested id, and max_rows is 1000: the chunk must stay strictly below it.
    expect(GOING_ID_CHUNK).toBeLessThan(MAX_ROWS)
  })

  it('foldCountRows drops values an integer count could never be', () => {
    expect(
      foldCountRows([
        { event_id: 'a', going: 3 },
        { event_id: ' b ', going: 2 },
        { event_id: '', going: 9 },
        { event_id: 'c', going: -1 },
        { event_id: 'd', going: Number.NaN },
      ]),
    ).toEqual({ a: 3, b: 2 })
  })
})

describe('goingCountsByEvent — the RPC path', () => {
  it('counts through the RPC when it exists', async () => {
    state.rsvps = seed({ e1: 3, e2: 1 })
    const counts = await goingCountsByEvent(['e1', 'e2', 'e3'])
    expect(counts).toEqual({ e1: 3, e2: 1 })
    expect(state.rpcCalls.map((c) => c.fn)).toEqual(['event_going_counts'])
    // Never falls through to the row read when the RPC answers.
    expect(state.rangeCalls).toEqual([])
  })

  it('ignores non-going statuses', async () => {
    state.rsvps = [...seed({ e1: 2 }), ...seed({ e1: 5 }, 'maybe'), ...seed({ e1: 4 }, 'cancelled')]
    expect(await goingCountsByEvent(['e1'])).toEqual({ e1: 2 })
  })

  // ── SCAN-105 / ADR-1148: a pending request is not a going seat ──────────────────────────────
  // The RPC applies this predicate server-side; the FALLBACK has to agree, or the "Has open spots"
  // facet and the Popularity sort would depend on whether the migration had been applied.
  it('the FALLBACK excludes approval_status pending, matching the RPC', async () => {
    state.rpcExists = false
    state.rsvps = [
      ...seed({ e1: 2 }), // ungated: approval_status defaults to 'none'
      { id: 'zz-approved', event_id: 'e1', status: 'going', approval_status: 'approved' },
      { id: 'zz-pending1', event_id: 'e1', status: 'going', approval_status: 'pending' },
      { id: 'zz-pending2', event_id: 'e1', status: 'going', approval_status: 'pending' },
    ]
    // Three real seats: two ungated + one approved. The two pending requests hold nothing.
    expect(await goingCountsByEvent(['e1'])).toEqual({ e1: 3 })
    expect(state.rangeCalls.length).toBeGreaterThan(0) // it really did take the fallback
  })

  it('chunks a listing wider than one call and merges the parts', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `e${i}`)
    state.rsvps = seed({ e0: 2, e900: 5, e1499: 1 })
    const counts = await goingCountsByEvent(ids)
    expect(counts).toEqual({ e0: 2, e900: 5, e1499: 1 })
    expect(state.rpcCalls).toHaveLength(3)
    expect(state.rpcCalls.every((c) => c.ids.length <= GOING_ID_CHUNK)).toBe(true)
  })

  it('counts past max_rows — the truncation the old read could not see', async () => {
    // 2,600 confirmed rows across three events: the old whole-listing select returned 1,000.
    state.rsvps = seed({ e1: 1500, e2: 1000, e3: 100 })
    expect(await goingCountsByEvent(['e1', 'e2', 'e3'])).toEqual({ e1: 1500, e2: 1000, e3: 100 })
  })
})

describe('goingCountsByEvent — the fail-safe when the migration is not applied', () => {
  it('falls back to the counting path when the RPC does not exist', async () => {
    state.rpcExists = false
    state.rsvps = seed({ e1: 3, e2: 1 })
    const counts = await goingCountsByEvent(['e1', 'e2'])
    expect(counts).toEqual({ e1: 3, e2: 1 })
    expect(state.rangeCalls.length).toBeGreaterThan(0) // it really did read rows
  })

  it('falls back when the RPC throws outright', async () => {
    state.rpcThrows = true
    state.rsvps = seed({ e1: 4 })
    expect(await goingCountsByEvent(['e1'])).toEqual({ e1: 4 })
  })

  it('the FALLBACK is itself correct past max_rows (it pages)', async () => {
    state.rpcExists = false
    state.rsvps = seed({ e1: 1500, e2: 900 })
    expect(await goingCountsByEvent(['e1', 'e2'])).toEqual({ e1: 1500, e2: 900 })
    // Proof it paged rather than trusting one capped response.
    expect(state.rangeCalls.length).toBeGreaterThan(1)
    expect(state.rangeCalls.every(([from, to]) => to - from + 1 <= MAX_ROWS)).toBe(true)
  })

  it('a partial RPC result is never double-counted on top of the tally', async () => {
    // 1,500 ids = 3 chunks; make only the LAST one fail, so a naive implementation that kept the
    // two successful chunks and then tallied everything would report double for those events.
    const ids = Array.from({ length: 1500 }, (_, i) => `e${i}`)
    state.rsvps = seed({ e0: 2, e1499: 3 })
    let call = 0
    const admin = await import('@/lib/supabase/admin')
    const real = admin.createAdminClient
    vi.spyOn(admin, 'createAdminClient').mockImplementation(() => {
      const client = real() as unknown as { rpc: (fn: string, a: Record<string, unknown>) => Promise<unknown> }
      const inner = client.rpc.bind(client)
      client.rpc = async (fn, a) => {
        if (++call === 3) return { data: null, error: { code: 'PGRST202' } }
        return inner(fn, a)
      }
      return client as never
    })
    expect(await goingCountsByEvent(ids)).toEqual({ e0: 2, e1499: 3 })
    // Not a vacuous pass: the third chunk really did fail, and the WHOLE set was re-counted by the
    // row path (had the two good chunks been kept, e0/e1499 would read 4 and 6).
    expect(call).toBe(3)
    expect(state.rangeCalls.length).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })

  it('fails safe to an empty map, never a throw, on an empty input', async () => {
    expect(await goingCountsByEvent([])).toEqual({})
    expect(await goingCountsByEvent([null, '', undefined])).toEqual({})
    expect(state.rpcCalls).toEqual([])
  })
})
