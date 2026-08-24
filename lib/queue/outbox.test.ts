import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  nextRetry,
  retryDelayFor,
  msUntilNextUtcMidnight,
  laneFor,
  bulkRunAfter,
  BULK_DUE_RATE_PER_MIN,
  LANE_KEY,
} from '@/lib/queue/outbox'

// The exact error Resend threw on 2026-07-17, as lib/email.ts stringifies it into an Error message.
// 359 jobs dead-lettered carrying this text; it is the regression fixture for the whole row.
const QUOTA_MSG =
  '[email] send failed: {"statusCode":429,"message":"You have reached your daily email sending quota.","name":"daily_quota_exceeded"}'
const quotaError = () => new Error(QUOTA_MSG)

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

describe('retryDelayFor (classify the error, then count the attempt)', () => {
  const ctx = (over: Partial<{ attempts: number; maxAttempts: number; ageMs: number; now: Date }> = {}) => ({
    attempts: 5,
    maxAttempts: 5,
    ageMs: 0,
    now: new Date('2026-07-17T16:30:00Z'),
    ...over,
  })

  it('defers a daily quota past the window WITHOUT spending an attempt, even at the cap', () => {
    const now = new Date('2026-07-17T16:30:00Z')
    const d = retryDelayFor(quotaError(), ctx({ now }))
    expect(d.status).toBe('pending')
    expect(d.countsAsAttempt).toBe(false)
    expect(d.reason).toBe('daily_quota')
    expect(d.delayMs).toBe(msUntilNextUtcMidnight(now)) // 7h30m, i.e. past the daily reset
    expect(d.delayMs).toBeGreaterThan(60 * 60_000)
  })

  it('honours a provider Retry-After over the computed window', () => {
    const err = Object.assign(new Error(QUOTA_MSG), { headers: { 'retry-after': '900' } })
    expect(retryDelayFor(err, ctx()).delayMs).toBe(900_000)
    const structured = Object.assign(new Error('rate limited'), { statusCode: 429, retryAfter: 42 })
    // Floored: a tiny Retry-After must not become a hot loop against a provider refusing us.
    expect(retryDelayFor(structured, ctx()).delayMs).toBe(60_000)
    // And capped, so a bad header cannot park a message for a month.
    const absurd = Object.assign(new Error('rate limited'), { statusCode: 429, retryAfter: 99_999_999 })
    expect(retryDelayFor(absurd, ctx()).delayMs).toBe(86_400_000)
  })

  it('backs a generic 429 off well past the 1m base, also without spending an attempt', () => {
    const d = retryDelayFor(new Error('429 Too Many Requests'), ctx())
    expect(d).toMatchObject({ status: 'pending', countsAsAttempt: false, reason: 'rate_limit' })
    expect(d.delayMs).toBe(15 * 60_000)
    // 5 retries at this delay can no longer all land inside the ~15 minutes that killed the queue.
    expect(d.delayMs * 5).toBeGreaterThan(60 * 60_000)
  })

  it('leaves every other error on the old policy, dead-letter semantics intact', () => {
    const under = retryDelayFor(new Error('boom'), ctx({ attempts: 2 }))
    expect(under).toEqual({ ...nextRetry(2, 5), countsAsAttempt: true, reason: 'error' })
    const atCap = retryDelayFor(new Error('boom'), ctx({ attempts: 5 }))
    expect(atCap).toMatchObject({ status: 'failed', countsAsAttempt: true })
  })

  it('bounds free deferrals by wall-clock age, so a never-clearing "quota" still dead-letters', () => {
    const old = retryDelayFor(quotaError(), ctx({ ageMs: 73 * 60 * 60_000 }))
    expect(old).toMatchObject({ status: 'failed', countsAsAttempt: true, reason: 'error' })
    const staleRateLimit = retryDelayFor(new Error('429 rate limit'), ctx({ ageMs: 2 * 60 * 60_000 }))
    expect(staleRateLimit).toMatchObject({ status: 'failed', countsAsAttempt: true, reason: 'error' })
  })

  it('reads the status code out of a structured error too, not only the message', () => {
    const err = Object.assign(new Error('nope'), { statusCode: 429 })
    expect(retryDelayFor(err, ctx()).reason).toBe('rate_limit')
  })
})

describe('lanes (bulk must never starve transactional)', () => {
  it('is transactional unless the job says otherwise', () => {
    expect(laneFor({ to: 'a@b.c' })).toBe('transactional')
    expect(laneFor(undefined)).toBe('transactional')
    expect(laneFor({ [LANE_KEY]: 'bulk' })).toBe('bulk')
  })

  it('reads a pre-lane campaign row as bulk from its campaign_id tag', () => {
    expect(laneFor({ to: 'a@b.c', tags: [{ name: 'campaign_id', value: 'c1' }] })).toBe('bulk')
  })

  it('drips a fan-out so it never comes due all at once', () => {
    const t0 = new Date('2026-07-17T16:00:00Z')
    expect(bulkRunAfter(0, t0).getTime()).toBe(t0.getTime())
    expect(bulkRunAfter(BULK_DUE_RATE_PER_MIN - 1, t0).getTime()).toBe(t0.getTime())
    expect(bulkRunAfter(BULK_DUE_RATE_PER_MIN, t0).getTime()).toBe(t0.getTime() + 60_000)
    // The incident's 356-recipient campaign now spreads over ~36 minutes instead of one second,
    // and stays under the drain's ~12.5 jobs/min capacity (25 jobs every 2 minutes).
    expect(bulkRunAfter(355, t0).getTime() - t0.getTime()).toBe(35 * 60_000)
    expect(BULK_DUE_RATE_PER_MIN).toBeLessThan(12.5)
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

// ── The 2026-07-17 regression, end to end through the drain (LIVE-091) ────────────────
describe('processQueue (a closed quota is a wait, not a failure)', () => {
  const emailJob = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'e1',
    kind: 'email',
    payload: { to: 'new-member@example.com', subject: 'Welcome to Frequency' },
    attempts: 0,
    max_attempts: 5,
    created_at: new Date().toISOString(),
    ...over,
  })
  const quotaHandler = { email: async () => { throw quotaError() } }

  it('does NOT dead-letter a job that hits the daily quota five times in a row', async () => {
    // The job the incident would have killed: on its LAST attempt, one failure from dead-letter.
    for (let i = 0; i < 5; i++) {
      rpcResult = { data: [emailJob({ attempts: 4 })], error: null }
      const r = await processQueue(quotaHandler, 25)
      expect(r).toMatchObject({ failed: 0, retried: 0, deferred: 1 })
    }
    expect(updates).toHaveLength(5)
    for (const u of updates) {
      expect(u.status).toBe('pending')
      expect(u.status).not.toBe(DEAD_LETTER_STATUS)
      // The attempt is NOT spent — writing it here is exactly how 359 emails died in 1h43m.
      expect(u).not.toHaveProperty('attempts')
      // …and it is scheduled PAST the quota window, not 1 minute out.
      const now = new Date()
      const expected = Math.max(60_000, msUntilNextUtcMidnight(now))
      const delay = Date.parse(u.run_after as string) - now.getTime()
      expect(Math.abs(delay - expected)).toBeLessThan(10_000)
    }
  })

  it('still dead-letters an ordinary failure at the cap (semantics unchanged)', async () => {
    rpcResult = { data: [emailJob({ attempts: 4 })], error: null }
    const r = await processQueue({ email: async () => { throw new Error('bad recipient') } }, 25)
    expect(updates[0]).toMatchObject({ status: DEAD_LETTER_STATUS, attempts: 5 })
    expect(r).toMatchObject({ failed: 1, deferred: 0 })
  })

  it('falls back to dead-lettering once the quota deferral outlives its 72h ceiling', async () => {
    const old = new Date(Date.now() - 80 * 60 * 60_000).toISOString()
    rpcResult = { data: [emailJob({ attempts: 4, created_at: old })], error: null }
    const r = await processQueue(quotaHandler, 25)
    expect(updates[0]).toMatchObject({ status: DEAD_LETTER_STATUS, attempts: 5 })
    expect(r).toMatchObject({ failed: 1 })
  })

  it('spends the last of the quota on the transactional job, not on campaign recipient 212', async () => {
    const sent: string[] = []
    rpcResult = {
      data: [
        emailJob({ id: 'bulk-1', payload: { to: 'list-1@example.com', [LANE_KEY]: 'bulk' } }),
        emailJob({ id: 'bulk-2', payload: { to: 'list-2@example.com', [LANE_KEY]: 'bulk' } }),
        emailJob({ id: 'welcome', payload: { to: 'new-member@example.com' } }),
      ],
      error: null,
    }
    await processQueue({ email: async (p) => { sent.push(p.to as string) } }, 25)
    // Claimed bulk-first (run_after order), drained transactional-first.
    expect(sent[0]).toBe('new-member@example.com')
    expect(sent).toHaveLength(3)
  })

  it('parks the rest of the bulk lane the moment the quota closes, without asking again', async () => {
    const tried: string[] = []
    rpcResult = {
      data: [
        emailJob({ id: 'welcome', payload: { to: 'new-member@example.com' } }),
        emailJob({ id: 'bulk-1', payload: { to: 'list-1@example.com', [LANE_KEY]: 'bulk' } }),
        emailJob({ id: 'bulk-2', payload: { to: 'list-2@example.com', [LANE_KEY]: 'bulk' } }),
      ],
      error: null,
    }
    const r = await processQueue({
      email: async (p) => {
        tried.push(p.to as string)
        throw quotaError()
      },
    }, 25)
    // The transactional job discovered the closed window; the two campaign jobs never touched
    // the provider, and neither spent an attempt.
    expect(tried).toEqual(['new-member@example.com'])
    expect(r).toMatchObject({ deferred: 3, failed: 0, retried: 0 })
    for (const u of updates) {
      expect(u.status).toBe('pending')
      expect(u).not.toHaveProperty('attempts')
      expect(Date.parse(u.run_after as string)).toBeGreaterThan(Date.now() + 30_000)
    }
  })
})
