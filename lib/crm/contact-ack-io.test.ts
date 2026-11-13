import { beforeEach, describe, expect, it, vi } from 'vitest'

// The sender against the real builder, with only the outbox, the suppression list and the once-claim mocked.
// Pins: a good submission enqueues exactly one transactional note with an hour-bucketed dedupe key; a suppressed
// address, a second submission inside the hour and a bad address send nothing; a failing outbox never throws.

const state = vi.hoisted(() => ({
  suppressed: false,
  claimed: true,
  enqueueThrows: false,
  claims: [] as { key: string; ttl: number }[],
  enqueued: [] as { payload: Record<string, unknown>; opts: Record<string, unknown> | undefined }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  enqueueEmail: (payload: Record<string, unknown>, opts?: Record<string, unknown>) => {
    if (state.enqueueThrows) return Promise.reject(new Error('outbox down'))
    state.enqueued.push({ payload, opts })
    return Promise.resolve()
  },
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: () => Promise.resolve(state.suppressed) }))
vi.mock('@/lib/rate-limit', () => ({
  claimOnce: (key: string, ttl: number) => {
    state.claims.push({ key, ttl })
    return Promise.resolve(state.claimed)
  },
}))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { sendContactAck } from './contact-ack-io'

const input = {
  spaceId: 's1', spaceSlug: 'north-light', spaceName: 'North Light Yoga', email: ' Maya@Example.com ', visitorName: 'Maya',
  signedOut: true, baseUrl: 'https://frequencylocal.com', now: new Date('2026-11-13T10:30:00Z'),
}

beforeEach(() => {
  state.suppressed = false
  state.claimed = true
  state.enqueueThrows = false
  state.claims = []
  state.enqueued = []
})

describe('sendContactAck', () => {
  it('enqueues one transactional note to the lowercased address, deduped per address, Space and hour', async () => {
    await expect(sendContactAck(input)).resolves.toBe('sent')
    expect(state.enqueued).toHaveLength(1)
    expect(state.enqueued[0].payload.to).toBe('maya@example.com')
    expect(state.enqueued[0].opts).toMatchObject({ lane: 'transactional', dedupeKey: `contact_ack:s1:maya@example.com:${Math.floor(input.now.getTime() / 3_600_000)}` })
    expect(state.claims).toEqual([{ key: 'contact_ack:s1:maya@example.com', ttl: 3600 }])
  })

  it('sends nothing to a suppressed address', async () => {
    state.suppressed = true
    await expect(sendContactAck(input)).resolves.toBe('skipped')
    expect(state.enqueued).toHaveLength(0)
  })

  it('sends nothing when this address already got one from this Space this hour', async () => {
    state.claimed = false
    await expect(sendContactAck(input)).resolves.toBe('limited')
    expect(state.enqueued).toHaveLength(0)
  })

  it('skips a malformed address', async () => {
    await expect(sendContactAck({ ...input, email: 'nope' })).resolves.toBe('skipped')
    expect(state.enqueued).toHaveLength(0)
  })

  it('never throws when the outbox fails', async () => {
    state.enqueueThrows = true
    await expect(sendContactAck(input)).resolves.toBe('failed')
  })
})
