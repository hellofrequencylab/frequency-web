import { describe, it, expect, beforeEach, vi } from 'vitest'

// EMAIL-070: a transactional email Resend accepted and then dropped for the daily limit goes back on
// the outbox for the next UTC day, once. Network-free: the injected db client and enqueue are fakes.

const H = vi.hoisted(() => ({
  attempt: null as { queue_job_id: string; frozen_payload: unknown } | null,
  attemptError: null as { message: string } | null,
  job: null as { kind: string; payload: unknown } | null,
  enqueued: [] as { kind: string; payload: Record<string, unknown>; opts: { runAfter?: Date; dedupeKey?: string } }[],
  keys: new Set<string>(),
}))

// The db the webhook passes in. The requeue never opens a service-role client of its own.
const db = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (table === 'email_provider_attempts') return { data: H.attempt, error: H.attemptError }
          if (table === 'notification_queue') return { data: H.job, error: null }
          throw new Error(`unexpected table ${table}`)
        },
      }),
    }),
  }),
}

vi.mock('@/lib/queue/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/queue/outbox')>()
  return {
    laneFor: real.laneFor,
    LANE_KEY: real.LANE_KEY,
    msUntilNextUtcMidnight: real.msUntilNextUtcMidnight,
    enqueue: async (kind: string, payload: Record<string, unknown>, opts: { runAfter?: Date; dedupeKey?: string }) => {
      if (opts.dedupeKey && H.keys.has(opts.dedupeKey)) return { enqueued: false }
      if (opts.dedupeKey) H.keys.add(opts.dedupeKey)
      H.enqueued.push({ kind, payload, opts })
      return { enqueued: true }
    },
  }
})

import { failedForDailyQuota, requeuePayloadFrom, requeueQuotaFailedEmail, REQUEUE_OF_KEY } from './quota-requeue'

const frozen = {
  from: 'Frequency <hello@send.example>',
  to: ['r@x.com'],
  subject: 'Tomorrow at The Group',
  html: '<p>See you</p>',
  text: 'See you',
  headers: { 'X-Entity-Ref': 'abc' },
}
const NOW = new Date('2026-11-18T15:30:00Z')

beforeEach(() => {
  H.attempt = { queue_job_id: 'job-1', frozen_payload: frozen }
  H.attemptError = null
  H.job = { kind: 'email', payload: { to: 'r@x.com', subject: 'Tomorrow at The Group', html: '<p>See you</p>' } }
  H.enqueued.length = 0
  H.keys.clear()
})

describe('failedForDailyQuota', () => {
  it('reads Resend failed.reason', () => {
    expect(failedForDailyQuota({ failed: { reason: 'reached_daily_quota' } })).toBe(true)
    expect(failedForDailyQuota({ failed: { reason: 'invalid_recipient' } })).toBe(false)
    expect(failedForDailyQuota(undefined)).toBe(false)
  })
})

describe('requeuePayloadFrom', () => {
  it('turns the frozen provider payload into one email job, marked as a requeue', () => {
    const p = requeuePayloadFrom(frozen, 'job-1', { deliveryContext: { version: 1 } })
    expect(p).toEqual({
      to: 'r@x.com', subject: 'Tomorrow at The Group', html: '<p>See you</p>', text: 'See you',
      headers: { 'X-Entity-Ref': 'abc' }, from: 'Frequency <hello@send.example>',
      deliveryContext: { version: 1 }, [REQUEUE_OF_KEY]: 'job-1',
    })
  })

  it('refuses a payload that is not one email to one person', () => {
    expect(requeuePayloadFrom({ ...frozen, to: ['a@x.com', 'b@x.com'] }, 'job-1')).toBeNull()
    expect(requeuePayloadFrom({ ...frozen, subject: '' }, 'job-1')).toBeNull()
    expect(requeuePayloadFrom(null, 'job-1')).toBeNull()
  })
})

describe('requeueQuotaFailedEmail', () => {
  it('requeues a transactional send for the next UTC midnight, keyed on the original job', async () => {
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('requeued')
    expect(H.enqueued).toHaveLength(1)
    const [{ kind, payload, opts }] = H.enqueued
    expect(kind).toBe('email')
    expect(payload).toMatchObject({ to: 'r@x.com', subject: 'Tomorrow at The Group', [REQUEUE_OF_KEY]: 'job-1' })
    expect(opts.runAfter?.toISOString()).toBe('2026-11-19T00:00:00.000Z')
    expect(opts.dedupeKey).toBe('quota-requeue:job-1')
  })

  it('never queues the same message twice when the webhook is delivered again', async () => {
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('requeued')
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('duplicate')
    expect(H.enqueued).toHaveLength(1)
  })

  it('requeues once only: a requeued send that hits the limit again stays dropped', async () => {
    H.job = { kind: 'email', payload: { to: 'r@x.com', subject: 's', [REQUEUE_OF_KEY]: 'job-0' } }
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('already-requeued')
    expect(H.enqueued).toHaveLength(0)
  })

  it('leaves bulk sends dropped', async () => {
    H.job = { kind: 'email', payload: { to: 'r@x.com', subject: 's', __lane: 'bulk' } }
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('bulk')
    H.job = { kind: 'space-campaign-email', payload: { to: 'r@x.com', subject: 's' } }
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('bulk')
    // The queue row was cleaned up: the frozen campaign tag still marks it bulk.
    H.job = null
    H.attempt = { queue_job_id: 'job-1', frozen_payload: { ...frozen, tags: [{ name: 'campaign_id', value: 'c1' }] } }
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('bulk')
    expect(H.enqueued).toHaveLength(0)
  })

  it('still requeues from the frozen payload when the queue row was cleaned up', async () => {
    H.job = null
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('requeued')
    expect(H.enqueued[0].payload).not.toHaveProperty('deliveryContext')
  })

  it('does nothing for a send the acceptance ledger never saw', async () => {
    H.attempt = null
    expect(await requeueQuotaFailedEmail(db, 're_1', NOW)).toBe('no-attempt')
    expect(H.enqueued).toHaveLength(0)
  })

  it('throws on a lookup error so the webhook asks Resend to redeliver', async () => {
    H.attemptError = { message: 'db down' }
    await expect(requeueQuotaFailedEmail(db, 're_1', NOW)).rejects.toThrow(/attempt lookup failed/)
  })
})
