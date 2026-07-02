import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextRetry } from '@/lib/queue/outbox'

describe('nextRetry (outbox retry policy)', () => {
  it('fails at or past the attempt cap', () => {
    expect(nextRetry(5, 5).status).toBe('failed')
    expect(nextRetry(6, 5).status).toBe('failed')
  })

  it('retries with exponential backoff under the cap', () => {
    expect(nextRetry(1, 5)).toEqual({ status: 'pending', delayMs: 60_000 })
    expect(nextRetry(2, 5)).toEqual({ status: 'pending', delayMs: 120_000 })
    expect(nextRetry(3, 5)).toEqual({ status: 'pending', delayMs: 240_000 })
  })
})

// processQueue wiring. The concurrency safety (FOR UPDATE SKIP LOCKED, disjoint claims, the
// 5-min stale-'processing' reclaim, the run_after due-filter) lives in the claim_outbox_jobs
// RPC and is verified against Postgres, not here — these lock the app-side wiring: the claim
// goes through the RPC, the handler runs, and each terminal transition moves the row out of
// 'processing' (done / retry-pending / dead-letter), plus fail-closed on a claim error.
type Rpc = { data: unknown; error: { message: string } | null }
let rpcResult: Rpc = { data: [], error: null }
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
const updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(patch)
          return { error: null }
        },
      }),
    }),
  }),
}))

import { processQueue, DEAD_LETTER_STATUS } from '@/lib/queue/outbox'

const job = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'j1', kind: 'push', payload: { to: 'p1' }, attempts: 0, max_attempts: 5, ...over,
})

beforeEach(() => {
  rpcResult = { data: [], error: null }
  rpcCalls.length = 0
  updates.length = 0
})

describe('processQueue (wiring)', () => {
  it('claims via claim_outbox_jobs with the limit, propagating a custom limit', async () => {
    await processQueue({}, 25)
    expect(rpcCalls).toEqual([{ fn: 'claim_outbox_jobs', args: { _limit: 25 } }])
    rpcCalls.length = 0
    await processQueue({}, 100)
    expect(rpcCalls[0].args).toEqual({ _limit: 100 })
  })

  it('runs the handler and marks the job done', async () => {
    rpcResult = { data: [job()], error: null }
    const handler = vi.fn(async () => {})
    const r = await processQueue({ push: handler }, 25)
    expect(handler).toHaveBeenCalledWith({ to: 'p1' })
    expect(updates[0]).toMatchObject({ status: 'done', attempts: 1, last_error: null })
    expect(r).toMatchObject({ done: 1, failed: 0, retried: 0 })
  })

  it('retries (status pending + backoff) when the handler throws under the cap', async () => {
    rpcResult = { data: [job({ attempts: 0 })], error: null }
    const r = await processQueue({ push: async () => { throw new Error('boom') } }, 25)
    expect(updates[0]).toMatchObject({ status: 'pending', attempts: 1 })
    expect(updates[0].run_after).toBeTypeOf('string') // backoff scheduled
    expect(r).toMatchObject({ retried: 1, failed: 0, done: 0 })
  })

  it('dead-letters when the handler throws at the attempt cap', async () => {
    rpcResult = { data: [job({ attempts: 4, max_attempts: 5 })], error: null }
    const r = await processQueue({ push: async () => { throw new Error('boom') } }, 25)
    expect(updates[0]).toMatchObject({ status: DEAD_LETTER_STATUS, attempts: 5 })
    expect(r).toMatchObject({ failed: 1 })
  })

  it('treats an unknown kind as a handler failure (never done)', async () => {
    rpcResult = { data: [job({ kind: 'mystery', attempts: 0 })], error: null }
    const r = await processQueue({}, 25)
    expect(updates[0].status).not.toBe('done')
    expect(r.done).toBe(0)
  })

  it('throws on a claim error instead of silently reporting 0 processed', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    await expect(processQueue({}, 25)).rejects.toThrow(/claim RPC failed/)
    expect(updates).toHaveLength(0)
  })
})
