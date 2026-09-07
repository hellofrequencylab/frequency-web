import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Sentry SDK so the test asserts capture behaviour without a real client.
const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  setTag: vi.fn(),
  setContext: vi.fn(),
  withScope: (fn: () => unknown) => fn(),
}))

import { DEFAULT_CRON_BUDGET_MS, CRON_CEILING_MS, withCronHeartbeat, resolveHeartbeatUrl } from '@/lib/observability/cron-heartbeat'

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

// ── LIVE-190 / ADR-1221: the duration instrument, which lives in the seam ──────────────────────
//
// The point of putting the timer here rather than in the routes is that no route can be missed.
// These tests pin the two properties that make the reading trustworthy: the line is emitted on
// EVERY path (a returned 200, a returned 500, and a throw), and `ok` reads the RESPONSE STATUS
// rather than "did it throw" — the distinction that rules `log.time` out for this job, since a
// cron that returns a 500 has not thrown and would have been logged as a success.
describe('withCronHeartbeat — the cron.run duration instrument', () => {
  function captureLog() {
    const lines: Array<{ event: string; fields: Record<string, unknown> }> = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      for (const a of args) {
        if (typeof a !== 'string') continue
        try {
          const parsed = JSON.parse(a) as Record<string, unknown>
          if (typeof parsed.event === 'string') lines.push({ event: parsed.event, fields: parsed })
        } catch {
          // Not a structured line; the logger also emits plain text in some modes.
        }
      }
    })
    return { lines, restore: () => spy.mockRestore() }
  }

  it('emits one cron.run line with a numeric duration on a 2xx', async () => {
    const { lines, restore } = captureLog()
    try {
      await withCronHeartbeat('process-queue', okRes)(req())
    } finally {
      restore()
    }
    const run = lines.filter((l) => l.event === 'cron.run')
    expect(run).toHaveLength(1)
    expect(run[0].fields.job).toBe('process-queue')
    expect(run[0].fields.status).toBe(200)
    expect(run[0].fields.ok).toBe(true)
    expect(typeof run[0].fields.duration_ms).toBe('number')
    expect(run[0].fields.duration_ms as number).toBeGreaterThanOrEqual(0)
  })

  // 🔴 THE CONTROL THAT RULES OUT log.time. A returned 500 is the loudest failure a cron has, and
  // a timer that decides `ok` by whether the function threw would file it under success.
  it('marks a RETURNED 500 as not-ok, because it never threw', async () => {
    const { lines, restore } = captureLog()
    try {
      await withCronHeartbeat('weekly-digest', errRes)(req())
    } finally {
      restore()
    }
    const run = lines.find((l) => l.event === 'cron.run')
    expect(run?.fields.status).toBe(500)
    expect(run?.fields.ok, 'a returned 500 is a failed run, not a successful one').toBe(false)
  })

  it('still emits the line when the handler THROWS, so a run that dies is not lost', async () => {
    const { lines, restore } = captureLog()
    const boom = () => {
      throw new Error('cron blew up')
    }
    try {
      await expect(withCronHeartbeat('season-go-live', boom)(req())).rejects.toThrow('cron blew up')
    } finally {
      restore()
    }
    const run = lines.find((l) => l.event === 'cron.run')
    expect(run, 'a throwing cron must still report its duration — that is the reading LIVE-190 wants').toBeDefined()
    expect(run?.fields.job).toBe('season-go-live')
    expect(run?.fields.ok).toBe(false)
    expect(typeof run?.fields.duration_ms).toBe('number')
  })

  it('a 4xx is reported as not-ok but is still one line, like every other outcome', async () => {
    const { lines, restore } = captureLog()
    try {
      await withCronHeartbeat('nurture', () => new Response('no', { status: 401 }))(req())
    } finally {
      restore()
    }
    const run = lines.filter((l) => l.event === 'cron.run')
    expect(run).toHaveLength(1)
    expect(run[0].fields.status).toBe(401)
    expect(run[0].fields.ok).toBe(false)
  })

  it('does not change the handler response or swallow its error', async () => {
    const res = await withCronHeartbeat('publish-scheduled', okRes)(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

// ── OWN-005 / the fail-safe that has to notice it failed ──────────────────────────────────────
//
// `fetch` rejects only on a TRANSPORT error. A monitor that ANSWERS "no" — Healthchecks.io
// returning 429 once the account is over its check cap (free tier caps at 20; vercel.json
// declares 27), or a 400/404 for a check that no longer exists — resolves normally, so before
// the status check the wrapper logged nothing at all. A dead-man's-switch that is silently
// rejecting pings is indistinguishable from one that was never wired, which is the exact shape
// AGENTS.md names: "every fail-safe needs a gate that notices it fired".
//
// These tests pin four properties: silence on a good ping, a warn on a rejected one (both the
// 4xx and 5xx families), the transport-error line still firing, and — the property that matters
// most — the cron's own outcome never moving because of any of it.
describe('withCronHeartbeat — a REJECTED ping is not silence', () => {
  function captureWarn() {
    const lines: Array<{ event: string; fields: Record<string, unknown> }> = []
    const read = (...args: unknown[]) => {
      for (const a of args) {
        if (typeof a !== 'string') continue
        try {
          const parsed = JSON.parse(a) as Record<string, unknown>
          if (typeof parsed.event === 'string') lines.push({ event: parsed.event, fields: parsed })
        } catch {
          // Not a structured line; the logger also emits plain text in some modes.
        }
      }
    }
    // The logger may route warnings to console.warn or console.log depending on mode.
    const spies = [
      vi.spyOn(console, 'warn').mockImplementation(read),
      vi.spyOn(console, 'log').mockImplementation(read),
    ]
    return { lines, restore: () => spies.forEach((s) => s.mockRestore()) }
  }

  const pingFailures = (lines: Array<{ event: string; fields: Record<string, unknown> }>) =>
    lines.filter((l) => l.event === 'cron.heartbeat.ping_failed')

  beforeEach(() => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  })

  it('stays silent when the monitor accepts the ping (200)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const { lines, restore } = captureWarn()
    try {
      await withCronHeartbeat('weekly-digest', okRes)(req())
    } finally {
      restore()
    }
    expect(pingFailures(lines), 'a healthy ping must not be noise').toHaveLength(0)
  })

  // 🔴 THE MUTATION CONTROL. Delete the `if (!res.ok)` check in pingHeartbeat and this goes red:
  // a 429 resolves, so the try/catch alone never sees it.
  it('logs when the monitor REJECTS the ping with a 429 (over the check cap)', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }))
    const { lines, restore } = captureWarn()
    try {
      await withCronHeartbeat('weekly-digest', okRes)(req())
    } finally {
      restore()
    }
    const failures = pingFailures(lines)
    expect(failures, 'a rejected ping is a dead dead-man’s-switch and must be logged').toHaveLength(1)
    expect(failures[0].fields.job).toBe('weekly-digest')
    expect(failures[0].fields.status).toBe(429)
    expect(failures[0].fields.fail, 'this was the alive ping, not the /fail ping').toBe(false)
  })

  it('logs a rejected FAIL ping too, and says it was the fail ping', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const { lines, restore } = captureWarn()
    try {
      await withCronHeartbeat('process-queue', errRes)(req())
    } finally {
      restore()
    }
    const failures = pingFailures(lines)
    expect(failures).toHaveLength(1)
    expect(failures[0].fields.job).toBe('process-queue')
    expect(failures[0].fields.status).toBe(500)
    expect(failures[0].fields.fail, 'the /fail endpoint rejecting is the worse of the two').toBe(true)
  })

  it('still logs a transport error, with no status, as it always did', async () => {
    fetchMock.mockRejectedValue(new Error('monitor unreachable'))
    const { lines, restore } = captureWarn()
    try {
      await withCronHeartbeat('weekly-digest', okRes)(req())
    } finally {
      restore()
    }
    const failures = pingFailures(lines)
    expect(failures).toHaveLength(1)
    expect(failures[0].fields.error).toContain('monitor unreachable')
    expect(failures[0].fields.status, 'a transport error has no HTTP status').toBeUndefined()
  })

  it('a rejected ping never changes the cron’s own outcome', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }))

    // Success stays a success...
    const ok = await withCronHeartbeat('weekly-digest', okRes)(req())
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ ok: true })

    // ...and a throwing handler still re-throws its ORIGINAL error, not a ping error.
    await expect(
      withCronHeartbeat('process-queue', vi.fn().mockRejectedValue(new Error('handler failure')))(req()),
    ).rejects.toThrow('handler failure')
  })
})

// ── LIVE-190, the budget half: every route states a per-invocation budget through the seam ──────
describe('withCronHeartbeat — the stated per-invocation budget', () => {
  /** Captures info AND warn lines: the over-budget signal is a warning, and a capture that only
   *  reads console.log would call a working warning missing. */
  function captureLog() {
    const lines: Array<{ event: string; fields: Record<string, unknown> }> = []
    const sink = (...args: unknown[]) => {
      for (const a of args) {
        if (typeof a !== 'string') continue
        try {
          const parsed = JSON.parse(a) as Record<string, unknown>
          if (typeof parsed.event === 'string') lines.push({ event: parsed.event, fields: parsed })
        } catch {
          // plain-text line
        }
      }
    }
    const spies = [vi.spyOn(console, 'log').mockImplementation(sink), vi.spyOn(console, 'warn').mockImplementation(sink)]
    return { lines, restore: () => spies.forEach((s) => s.mockRestore()) }
  }
  const okRes = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))

  it('the default budget is a fifth of the platform ceiling, and every route carries it', async () => {
    expect(DEFAULT_CRON_BUDGET_MS).toBe(CRON_CEILING_MS / 5)
    const { lines, restore } = captureLog()
    try {
      await withCronHeartbeat('process-queue', okRes)(req())
    } finally {
      restore()
    }
    const run = lines.find((l) => l.event === 'cron.run')
    expect(run?.fields.budget_ms).toBe(DEFAULT_CRON_BUDGET_MS)
    expect(run?.fields.over_budget).toBe(false)
    expect(lines.some((l) => l.event === 'cron.over_budget')).toBe(false)
  })

  it('a route may declare its own budget, and crossing it is flagged on the line AND as a warning', async () => {
    const { lines, restore } = captureLog()
    const slow = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 15))
      return new Response('ok', { status: 200 })
    })
    try {
      await withCronHeartbeat('publish-scheduled', slow, { budgetMs: 1 })(req())
    } finally {
      restore()
    }
    const run = lines.find((l) => l.event === 'cron.run')
    expect(run?.fields.budget_ms).toBe(1)
    expect(run?.fields.over_budget).toBe(true)
    const warn = lines.find((l) => l.event === 'cron.over_budget')
    expect(warn?.fields.job).toBe('publish-scheduled')
    expect(warn?.fields.budget_ms).toBe(1)
  })

  it('the budget rides the throw path too, so a run that dies is still measured against it', async () => {
    const { lines, restore } = captureLog()
    try {
      await Promise.resolve(
        withCronHeartbeat('season-go-live', vi.fn().mockRejectedValue(new Error('boom')), { budgetMs: 5_000 })(req()),
      ).catch(() => {})
    } finally {
      restore()
    }
    const run = lines.find((l) => l.event === 'cron.run')
    expect(run?.fields.budget_ms).toBe(5_000)
    expect(typeof run?.fields.over_budget).toBe('boolean')
  })
})
