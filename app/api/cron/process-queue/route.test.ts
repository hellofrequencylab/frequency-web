import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// LIVE-547 (ADR-1571). A dead-lettered job or a queue an hour deep used to be a console.error and an
// admin widget. This pins that a breach reaches the two paths that page (a Sentry capture tagged by
// job, and the heartbeat /fail ping through the wrapper) WITHOUT failing the drain, and that a clean
// drain reaches neither: it alive-pings exactly as before.

const state = vi.hoisted(() => ({
  health: { pending: 0, deadLettered: 0, lagMin: 0, oldestDueAgeMin: null as number | null, measured: true },
  drain: { processed: 3, done: 3, failed: 0, retried: 0, deferred: 0 },
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => state.captureMessage(...args),
  captureException: (...args: unknown[]) => state.captureException(...args),
  setTag: vi.fn(),
  setContext: vi.fn(),
}))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/queue/handlers', () => ({ queueHandlers: {} }))
vi.mock('@/lib/queue/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/queue/outbox')>()
  return {
    ...real,
    processQueue: () => Promise.resolve(state.drain),
    queueHealth: () => Promise.resolve(state.health),
  }
})

import { GET } from './route'
import { CRON_SLO_BREACH_HEADER } from '@/lib/observability/cron-heartbeat'

const req = () => new Request('https://app.test/api/cron/process-queue') as unknown as NextRequest
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  state.health = { pending: 0, deadLettered: 0, lagMin: 0, oldestDueAgeMin: null, measured: true }
  state.drain = { processed: 3, done: 3, failed: 0, retried: 0, deferred: 0 }
  state.captureMessage.mockReset()
  state.captureException.mockReset()
  process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.CRON_HEARTBEAT_BASE_URL
})

describe('process-queue: a clean drain', () => {
  it('captures nothing, alive-pings, and returns the health with the drain counts', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get(CRON_SLO_BREACH_HEADER)).toBeNull()
    const body = (await res.json()) as { ok: boolean; health: unknown; breaches: string[]; done: number }
    expect(body).toMatchObject({ ok: true, done: 3, breaches: [], health: state.health })

    expect(state.captureMessage).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/process-queue')
  })
})

describe('process-queue: a breached reading', () => {
  it('a dead-letter is a Sentry capture tagged by job, with the three numbers, and a /fail ping', async () => {
    state.health = { pending: 4, deadLettered: 2, lagMin: 1, oldestDueAgeMin: 30, measured: true }
    const res = await GET(req())

    // The drain is NOT failed: a 500 would make the next cron redo work that was fine.
    expect(res.status).toBe(200)
    expect(res.headers.get(CRON_SLO_BREACH_HEADER)).toBe('dead-letters above zero')

    expect(state.captureMessage).toHaveBeenCalledOnce()
    const [message, ctx] = state.captureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain('dead-letters above zero')
    expect(ctx).toMatchObject({
      level: 'error',
      tags: { cron_job: 'process-queue', route: 'cron.process-queue' },
      extra: { pending: 4, deadLettered: 2, lagMin: 1 },
    })

    // The wrapper saw the header and told the dead-man's switch, not the alive endpoint.
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/process-queue/fail')
  })

  it('a queue older than the published lag SLO pages the same way, with no second literal', async () => {
    state.health = { pending: 40, deadLettered: 0, lagMin: 11, oldestDueAgeMin: 11, measured: true }
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get(CRON_SLO_BREACH_HEADER)).toBe('queue lag over the 10 min SLO')
    expect(state.captureMessage).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/process-queue/fail')
  })

  it('the Sentry fingerprint is stable across drains, so an hour-long breach is one issue', async () => {
    state.health = { pending: 4, deadLettered: 2, lagMin: 0, oldestDueAgeMin: 30, measured: true }
    await GET(req())
    state.health = { pending: 9, deadLettered: 5, lagMin: 3, oldestDueAgeMin: 45, measured: true }
    await GET(req())
    const [, a] = state.captureMessage.mock.calls[0] as [string, { fingerprint: string[] }]
    const [, b] = state.captureMessage.mock.calls[1] as [string, { fingerprint: string[] }]
    expect(a.fingerprint).toEqual(b.fingerprint)
  })
})
