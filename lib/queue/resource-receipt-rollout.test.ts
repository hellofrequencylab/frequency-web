import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ jobs: [] as Record<string, unknown>[], updates: [] as { id: string; patch: Record<string, unknown> }[], writeError: false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: async () => ({ data: state.jobs.filter(job => job.status === 'pending' && Date.parse(job.run_after as string) <= Date.now()).map(job => {
    job.status = 'processing'
    return { ...job }
  }), error: null }),
  from: () => ({ update: (patch: Record<string, unknown>) => ({ eq: async (_field: string, id: string) => {
    state.updates.push({ id, patch })
    if (state.writeError) return { error: { message: 'parking unavailable' } }
    Object.assign(state.jobs.find(job => job.id === id)!, patch)
    return { error: null }
  } }) }),
}) }))
import { processQueue } from './outbox'
import { resourceReceiptEmailEnabled, shouldHoldResourceReceipt } from '@/lib/crm/lead-magnet-resource-policy'

const flag = 'LEAD_MAGNET_RESOURCE_EMAIL_ENABLED'
const key = 'lead_magnet_resource:' + 'a'.repeat(64) + ':12345'
const now = new Date('2026-11-15T12:00:00Z')
const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'resource', kind: 'email', dedupe_key: key,
  payload: { to: 'reader@example.com', subject: 'Your requested resource', html: '' },
  attempts: 4, max_attempts: 5, status: 'pending', run_after: now.toISOString(),
  created_at: '2026-10-01T12:00:00Z', ...overrides,
})
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv(flag, '')
  state.jobs = []; state.updates = []; state.writeError = false
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('requested-resource rollout boundaries', () => {
  it.each([undefined, '', '0', 'false', 'off', 'unknown'])('defaults off for %s', value => {
    vi.stubEnv(flag, value)
    expect(resourceReceiptEmailEnabled()).toBe(false)
    expect(shouldHoldResourceReceipt({ kind: 'email', dedupe_key: key })).toBe(true)
  })
  it.each(['1', 'true', 'on', ' TRUE '])('opens only on explicit opt-in %s', value => {
    vi.stubEnv(flag, value)
    expect(resourceReceiptEmailEnabled()).toBe(true)
    expect(shouldHoldResourceReceipt({ kind: 'email', dedupe_key: key })).toBe(false)
  })
  it('recognizes only canonical resource email DB keys, never other kinds or payload claims', () => {
    for (const value of [null, undefined, '', 'contact_ack:a:b:1', 'lead_magnet_resource:bad:1', key + ':extra']) {
      expect(shouldHoldResourceReceipt({ kind: 'email', dedupe_key: value })).toBe(false)
    }
    expect(shouldHoldResourceReceipt({ kind: 'push', dedupe_key: key })).toBe(false)
  })
  it('releases an already-queued resource to pending with the last attempt intact while other email/push still dispatch', async () => {
    state.jobs = [makeJob(), makeJob({ id: 'other', dedupe_key: 'contact_ack:space:reader:12345', attempts: 0 }), makeJob({ id: 'push', kind: 'push', attempts: 0 })]
    const email = vi.fn(async () => {}), push = vi.fn(async () => {})
    const result = await processQueue({ email, push })
    expect(result).toEqual({ processed: 3, done: 2, failed: 0, retried: 0, deferred: 1 })
    expect(email).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
    expect(state.jobs[0]).toMatchObject({ status: 'pending', attempts: 4, max_attempts: 5, run_after: '2026-11-15T13:00:00.000Z' })
    const resourcePatch = state.updates.find(update => update.id === 'resource')!.patch
    expect(resourcePatch).not.toHaveProperty('attempts')
    expect(resourcePatch.status).toBe('pending')
    expect(resourcePatch.last_error).toMatch(/rollout is off/)
    const second = await processQueue({ email, push })
    expect(second.processed).toBe(0)
    expect(email).toHaveBeenCalledTimes(1)
  })
  it('replays one due resource after explicit enable and spends only its successful delivery attempt', async () => {
    state.jobs = [makeJob()]
    const email = vi.fn(async () => {})
    await processQueue({ email })
    expect(email).not.toHaveBeenCalled()
    vi.stubEnv(flag, '1')
    expect((await processQueue({ email })).processed).toBe(0)
    vi.advanceTimersByTime(3_600_001)
    expect(await processQueue({ email })).toEqual({ processed: 1, done: 1, failed: 0, retried: 0, deferred: 0 })
    expect(email).toHaveBeenCalledTimes(1)
    expect(state.jobs[0]).toMatchObject({ status: 'done', attempts: 5 })
  })
  it('surfaces a rejected hold write without invoking the handler or acknowledging delivery', async () => {
    state.jobs = [makeJob()]; state.writeError = true
    const email = vi.fn(async () => {})
    await expect(processQueue({ email })).rejects.toThrow('parking unavailable')
    expect(email).not.toHaveBeenCalled()
    expect(state.updates.map(update => update.patch.status)).toEqual(['pending'])
    expect(state.jobs[0].attempts).toBe(4)
  })
  it('rechecks the flag for every job in the drain', async () => {
    vi.stubEnv(flag, 'on')
    state.jobs = [makeJob({ id: 'other', dedupe_key: 'contact_ack:space:reader:12345' }), makeJob()]
    const email = vi.fn(async () => { vi.stubEnv(flag, '') })
    const result = await processQueue({ email })
    expect(email).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ done: 1, deferred: 1 })
    expect(state.jobs[1]).toMatchObject({ status: 'pending', attempts: 4 })
  })
})
