import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-547 (ADR-1571). The queue's three health numbers, read together after every drain, and the
// pure breach rule the cron pages on. The lag is measured from run_after of the oldest DUE job, not
// from created_at: a job parked by backoff or a closed quota is waiting by design, and the whole
// point of LIVE-091 was that a wait must never read as a failure.

type Row = { created_at: string | null; run_after: string | null }
const reads = vi.hoisted(() => ({
  pending: { count: 0 as number | null, error: null as { message: string } | null },
  dead: { count: 0 as number | null, error: null as { message: string } | null },
  oldest: { data: null as Row | null, error: null as { message: string } | null },
  filters: [] as Array<{ op: string; args: unknown[] }>,
  throwOnConnect: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (reads.throwOnConnect) throw new Error('no service role key')
    return {
      from: () => ({
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            // The two counts: `.eq('status', X)` resolves to the count for that status.
            return {
              eq: (_col: string, status: string) =>
                Promise.resolve(status === 'pending' ? reads.pending : reads.dead),
            }
          }
          // The oldest-due read: a chain that records its filters and resolves with one row.
          const chain = {
            eq: (...args: unknown[]) => (reads.filters.push({ op: 'eq', args }), chain),
            lte: (...args: unknown[]) => (reads.filters.push({ op: 'lte', args }), chain),
            order: (...args: unknown[]) => (reads.filters.push({ op: 'order', args }), chain),
            limit: (...args: unknown[]) => (reads.filters.push({ op: 'limit', args }), chain),
            maybeSingle: () => Promise.resolve(reads.oldest),
          }
          return chain
        },
      }),
    }
  },
}))

import { queueHealth, queueHealthBreaches, QUEUE_LAG_SLO_ID, type QueueHealth } from '@/lib/queue/outbox'
import { getSlo } from '@/lib/observability/slos'

const NOW = new Date('2026-09-29T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

beforeEach(() => {
  reads.pending = { count: 0, error: null }
  reads.dead = { count: 0, error: null }
  reads.oldest = { data: null, error: null }
  reads.filters.length = 0
  reads.throwOnConnect = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('queueHealth (the reader)', () => {
  it('reads an empty queue as three zeros, measured', async () => {
    expect(await queueHealth(NOW)).toEqual({
      pending: 0,
      deadLettered: 0,
      lagMin: 0,
      oldestDueAgeMin: null,
      measured: true,
    })
  })

  it('asks for the oldest PENDING job that is already DUE, by run_after', async () => {
    await queueHealth(NOW)
    expect(reads.filters).toEqual([
      { op: 'eq', args: ['status', 'pending'] },
      { op: 'lte', args: ['run_after', NOW.toISOString()] },
      { op: 'order', args: ['run_after', { ascending: true }] },
      { op: 'limit', args: [1] },
    ])
  })

  it('reports the lag as minutes past run_after, and the age as minutes since created_at', async () => {
    reads.pending.count = 7
    reads.dead.count = 2
    // Enqueued 40 minutes ago, retried with backoff, became due 12 minutes ago and nobody claimed it.
    reads.oldest.data = { created_at: minutesAgo(40), run_after: minutesAgo(12) }
    expect(await queueHealth(NOW)).toEqual({
      pending: 7,
      deadLettered: 2,
      lagMin: 12,
      oldestDueAgeMin: 40,
      measured: true,
    })
  })

  it('never throws: a failed read is logged and leaves measured: false', async () => {
    reads.dead.error = { message: 'permission denied' }
    const h = await queueHealth(NOW)
    expect(h.measured).toBe(false)
    expect(h.deadLettered).toBe(0)
    reads.dead.error = null
    reads.throwOnConnect = true
    await expect(queueHealth(NOW)).resolves.toMatchObject({ measured: false })
  })
})

describe('queueHealthBreaches (the rule the cron pages on)', () => {
  const clean: QueueHealth = { pending: 3, deadLettered: 0, lagMin: 0, oldestDueAgeMin: 1, measured: true }

  it('a clean reading is no breach', () => {
    expect(queueHealthBreaches(clean)).toEqual([])
  })

  it('one dead-letter is a breach', () => {
    expect(queueHealthBreaches({ ...clean, deadLettered: 1 })).toEqual(['dead-letters above zero'])
  })

  it('the lag threshold is the target published in slos.ts, not a literal here', () => {
    const slo = getSlo(QUEUE_LAG_SLO_ID)
    expect(slo).toBeDefined()
    expect(slo?.onBreach).toBe('page')
    const target = slo?.target as number
    // At the target it meets the SLO (lower-is-better, <=); one minute over breaches.
    expect(queueHealthBreaches({ ...clean, lagMin: target })).toEqual([])
    expect(queueHealthBreaches({ ...clean, lagMin: target + 1 })).toEqual([
      `queue lag over the ${target} ${slo?.unit} SLO`,
    ])
  })

  it('an unmeasured queue is a breach, not a pass: a reader that silently failed would never page', () => {
    expect(queueHealthBreaches({ ...clean, measured: false })).toContain('queue health could not be read')
  })

  it('a job that is merely PENDING with a future run_after is not lag', () => {
    // The reader gives lag 0 for a deferred job; the rule sees no breach. Together they are the
    // LIVE-091 promise: waiting on a window never reads as failing.
    expect(queueHealthBreaches({ ...clean, pending: 356, lagMin: 0, oldestDueAgeMin: null })).toEqual([])
  })
})
