import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Sentry SDK so the test asserts capture behaviour without a real client.
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  setTag: vi.fn(),
  setContext: vi.fn(),
  withScope: (fn: () => unknown) => fn(),
}))

import { withCronHeartbeat, resolveHeartbeatUrl } from '@/lib/observability/cron-heartbeat'

// A fresh env per test so configured/unconfigured paths are isolated.
const ENV_KEYS = [
  'CRON_HEARTBEAT_BASE_URL',
  'CRON_HEARTBEAT_URL_WEEKLY_DIGEST',
  'CRON_HEARTBEAT_URL_PROCESS_QUEUE',
]

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
}

const okRes = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
const errRes = () => new Response(JSON.stringify({ ok: false }), { status: 500 })
const req = () => new Request('https://app.test/api/cron/x')

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearEnv()
  captureException.mockReset()
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearEnv()
})

describe('resolveHeartbeatUrl', () => {
  it('returns null when no heartbeat env is configured (no-op mode)', () => {
    expect(resolveHeartbeatUrl('weekly-digest')).toBeNull()
  })

  it('appends the job name to the base URL', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    expect(resolveHeartbeatUrl('weekly-digest')).toBe('https://hc.example/ping/weekly-digest')
  })

  it('strips a trailing slash on the base URL before appending', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping/'
    expect(resolveHeartbeatUrl('process-queue')).toBe('https://hc.example/ping/process-queue')
  })

  it('prefers a per-job override over the base URL', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_URL_WEEKLY_DIGEST = 'https://direct.example/abc'
    expect(resolveHeartbeatUrl('weekly-digest')).toBe('https://direct.example/abc')
  })

  it('maps hyphens to underscores for the per-job env suffix', () => {
    process.env.CRON_HEARTBEAT_URL_PROCESS_QUEUE = 'https://direct.example/pq'
    expect(resolveHeartbeatUrl('process-queue')).toBe('https://direct.example/pq')
  })
})

describe('withCronHeartbeat — unconfigured (safe no-op)', () => {
  it('runs the handler and returns its response without pinging', async () => {
    const handler = vi.fn().mockResolvedValue(okRes())
    const res = await withCronHeartbeat('weekly-digest', handler)(req())

    expect(handler).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled() // no monitor → no ping
  })

  it('does not capture to Sentry on success', async () => {
    await withCronHeartbeat('weekly-digest', vi.fn().mockResolvedValue(okRes()))(req())
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('withCronHeartbeat — configured success', () => {
  beforeEach(() => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  })

  it('pings the alive heartbeat after a 2xx response', async () => {
    const res = await withCronHeartbeat('weekly-digest', vi.fn().mockResolvedValue(okRes()))(req())

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hc.example/ping/weekly-digest')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('pings the /fail endpoint when the handler returns a non-2xx response', async () => {
    const res = await withCronHeartbeat('weekly-digest', vi.fn().mockResolvedValue(errRes()))(req())

    // The original 500 is passed through unchanged.
    expect(res.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/weekly-digest/fail')
  })
})

describe('withCronHeartbeat — failure (throw)', () => {
  it('captures to Sentry and RE-THROWS so the route still 5xxs', async () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    const boom = new Error('drain exploded')
    const handler = vi.fn().mockRejectedValue(boom)

    await expect(withCronHeartbeat('process-queue', handler)(req())).rejects.toThrow('drain exploded')

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException.mock.calls[0][0]).toBe(boom)
    // Tagged by job for filtering in Sentry.
    expect(captureException.mock.calls[0][1]).toMatchObject({
      tags: { route: 'cron.process-queue', cron_job: 'process-queue' },
    })
    // Failure pings the /fail endpoint.
    expect(fetchMock).toHaveBeenCalledWith('https://hc.example/ping/process-queue/fail', expect.anything())
  })

  it('still re-throws when no monitor is configured (capture only)', async () => {
    const boom = new Error('no monitor')
    await expect(
      withCronHeartbeat('nurture', vi.fn().mockRejectedValue(boom))(req()),
    ).rejects.toThrow('no monitor')

    expect(captureException).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled() // unconfigured → no ping
  })
})

describe('withCronHeartbeat — monitor outage never breaks the cron', () => {
  it('returns the handler response even if the heartbeat ping itself throws', async () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    fetchMock.mockRejectedValue(new Error('monitor unreachable'))

    const res = await withCronHeartbeat('weekly-digest', vi.fn().mockResolvedValue(okRes()))(req())

    // Ping failure is swallowed; the cron's own success is unaffected.
    expect(res.status).toBe(200)
  })

  it('still re-throws the ORIGINAL handler error even if the fail-ping throws', async () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    fetchMock.mockRejectedValue(new Error('monitor unreachable'))
    const boom = new Error('handler failure')

    await expect(
      withCronHeartbeat('process-queue', vi.fn().mockRejectedValue(boom))(req()),
    ).rejects.toThrow('handler failure') // not the ping error
  })
})
