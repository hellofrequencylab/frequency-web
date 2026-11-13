import { describe, it, expect, vi, beforeEach } from 'vitest'

// enqueueMany (one insert for a campaign chunk) and processQueueFor (drain for a time budget, not one
// batch of 25). The two halves of "10,000 emails go out without anyone pressing anything".

let inserted: Record<string, unknown>[][]
let taken: Set<string>
let claimBatches: { id: string; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }[][]
let claims: number
let handled: string[]

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => {
      claims++
      return { data: claimBatches.shift() ?? [], error: null }
    },
    from: () => ({
      insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(rows) ? rows : [rows]
        inserted.push(list)
        const keys = list.map((r) => r.dedupe_key as string | undefined).filter(Boolean) as string[]
        if (keys.some((k) => taken.has(k))) {
          // Atomic, like Postgres: a violation inserts nothing from this statement.
          inserted.pop()
          return { error: { code: '23505', message: 'duplicate key' } }
        }
        keys.forEach((k) => taken.add(k))
        return { error: null }
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

import { enqueueMany, processQueueFor, LANE_KEY } from './outbox'

beforeEach(() => {
  inserted = []
  taken = new Set()
  claimBatches = []
  claims = 0
  handled = []
})

const job = (id: string) => ({ id, kind: 'k', payload: { to: id }, attempts: 0, max_attempts: 5 })

describe('enqueueMany', () => {
  it('queues a whole chunk in ONE insert, stamping the bulk lane and each row\'s own run_after and key', async () => {
    const t = new Date('2026-11-12T15:00:00Z')
    const r = await enqueueMany(
      'email',
      [
        { payload: { to: 'a@x.test' }, runAfter: t, dedupeKey: 'k1' },
        { payload: { to: 'b@x.test' }, dedupeKey: 'k2' },
      ],
      { lane: 'bulk' },
    )
    expect(r).toEqual({ enqueued: 2, duplicates: 0 })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(2)
    expect(inserted[0][0]).toMatchObject({ kind: 'email', run_after: t.toISOString(), dedupe_key: 'k1', max_attempts: 5 })
    expect((inserted[0][0].payload as Record<string, unknown>)[LANE_KEY]).toBe('bulk')
  })

  it('an empty batch is a no-op', async () => {
    expect(await enqueueMany('email', [])).toEqual({ enqueued: 0, duplicates: 0 })
    expect(inserted).toHaveLength(0)
  })

  it('a chunk an interrupted run half-queued is finished row by row, never twice', async () => {
    taken.add('k2')
    const r = await enqueueMany('email', [
      { payload: { to: 'a' }, dedupeKey: 'k1' },
      { payload: { to: 'b' }, dedupeKey: 'k2' },
      { payload: { to: 'c' }, dedupeKey: 'k3' },
    ])
    expect(r).toEqual({ enqueued: 2, duplicates: 1 })
    expect([...taken].sort()).toEqual(['k1', 'k2', 'k3'])
  })
})

describe('processQueueFor', () => {
  const handlers = { k: async (p: Record<string, unknown>) => { handled.push(String(p.to)) } }

  it('keeps claiming batches until the clock is spent', async () => {
    claimBatches = [[job('a'), job('b')], [job('c'), job('d')], [job('e'), job('f')]]
    let calls = 0
    const r = await processQueueFor(handlers, { batch: 2, exhausted: () => ++calls >= 2 })
    expect(handled).toEqual(['a', 'b', 'c', 'd'])
    expect(r.processed).toBe(4)
    expect(r.done).toBe(4)
    expect(claims).toBe(2)
  })

  it('stops at once when the queue has nothing due (a short batch)', async () => {
    claimBatches = [[job('a')]]
    const r = await processQueueFor(handlers, { batch: 25, exhausted: () => false })
    expect(r.processed).toBe(1)
    expect(claims).toBe(1)
  })
})
