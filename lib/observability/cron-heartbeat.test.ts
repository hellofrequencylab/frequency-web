import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Sentry SDK so the test asserts capture behaviour without a real client.
const captureException = vi.fn()
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  setTag: vi.fn(),
  setContext: vi.fn(),
  withScope: (fn: () => unknown) => fn(),
}))

import {
  DEFAULT_CRON_BUDGET_MS,
  CRON_CEILING_MS,
  CRON_SLO_BREACH_HEADER,
  withCronHeartbeat,
  resolveHeartbeatUrl,
  resetHeartbeatEscalationForTests,
} from '@/lib/observability/cron-heartbeat'
import { CRON_MONITORED, CRON_UNMONITORED } from '@/lib/observability/slos'

// A fresh env per test so configured/unconfigured paths are isolated.
//
// ⚠️ Swept by PREFIX, not by a hardcoded list. The list version held three names and silently
// leaked any other CRON_HEARTBEAT_* var a later test set — which is exactly what happened when
// the opt-out tests below were added: `CRON_HEARTBEAT_URL_EMBED_EVENTS` survived into the next
// test and made it assert the wrong resolution. A per-job override is a var whose NAME is
// derived from a job name, so the set is open-ended by construction and cannot be enumerated
// ahead of time.
function clearEnv() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('CRON_HEARTBEAT')) delete process.env[k]
  }
}

const okRes = () => new Response(JSON.stringify({ ok: true }), { status: 200 })
const errRes = () => new Response(JSON.stringify({ ok: false }), { status: 500 })
const req = () => new Request('https://app.test/api/cron/x')

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearEnv()
  captureException.mockReset()
  captureMessage.mockReset()
  resetHeartbeatEscalationForTests()
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

// LIVE-217. The free tier monitors 20 of 28 crons, so the other 8 ping a check that does not
// exist and the monitor answers 404 — a line byte-identical to the one meaning a check was
// deleted or the ping key rotated. These tests pin the opt-out AND its default, because the
// default is the half that can silently unmonitor a cron nobody remembered to wire.
describe('resolveHeartbeatUrl — deliberate opt-out (CRON_HEARTBEAT_SKIP)', () => {
  it('returns null for a job named in the skip list, even with a base URL set', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_SKIP = 'embed-events'
    expect(resolveHeartbeatUrl('embed-events')).toBeNull()
  })

  it('THE CONTROL: a job NOT on the list still pings, so a new cron is monitored by default', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_SKIP = 'embed-events'
    expect(resolveHeartbeatUrl('process-queue')).toBe('https://hc.example/ping/process-queue')
  })

  it('beats a per-job override, so opting out is ONE edit and not two', () => {
    process.env.CRON_HEARTBEAT_URL_EMBED_EVENTS = 'https://direct.example/ee'
    process.env.CRON_HEARTBEAT_SKIP = 'embed-events'
    expect(resolveHeartbeatUrl('embed-events')).toBeNull()
  })

  it('reads a whole comma-separated list, with whitespace tolerated', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_SKIP = 'embed-events, embed-room-messages ,refresh-traits'
    expect(resolveHeartbeatUrl('embed-events')).toBeNull()
    expect(resolveHeartbeatUrl('embed-room-messages')).toBeNull()
    expect(resolveHeartbeatUrl('refresh-traits')).toBeNull()
    expect(resolveHeartbeatUrl('weekly-digest')).toBe('https://hc.example/ping/weekly-digest')
  })

  it('matches the WHOLE job name, so a prefix cannot silence a longer sibling', () => {
    // 'event-reminders' must not be silenced by 'space-follower-event-reminders' or vice versa;
    // both are real jobs and one is monitored while the other could be opted out.
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_SKIP = 'event-reminders'
    expect(resolveHeartbeatUrl('event-reminders')).toBeNull()
    expect(resolveHeartbeatUrl('space-follower-event-reminders')).toBe(
      'https://hc.example/ping/space-follower-event-reminders',
    )
  })

  it('an empty or whitespace-only list opts nobody out', () => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
    process.env.CRON_HEARTBEAT_SKIP = '  , ,'
    expect(resolveHeartbeatUrl('embed-events')).toBe('https://hc.example/ping/embed-events')
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

// LIVE-547 (ADR-1571). A run that FINISHED but left an SLO breached (a dead-letter in the queue, a
// due job older than the lag target) says so on a response header. The wrapper then tells the
// dead-man's switch /fail instead of alive, so the check stays down while the breach lasts, and the
// response itself is untouched: a 500 would make the next cron redo work that was fine, and a handler
// that fail-pinged on its own would be followed by this wrapper's alive-ping and flap the monitor.
describe('withCronHeartbeat — a 2xx carrying CRON_SLO_BREACH_HEADER', () => {
  beforeEach(() => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  })
  const breached = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { [CRON_SLO_BREACH_HEADER]: 'dead-letters above zero' },
    })

  it('pings /fail, not alive, and leaves the 200 alone', async () => {
    const res = await withCronHeartbeat('process-queue', vi.fn().mockResolvedValue(breached()))(req())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/process-queue/fail')
    expect(captureException).not.toHaveBeenCalled() // the handler captured its own message
  })

  it('THE CONTROL: the same 200 without the header still alive-pings', async () => {
    await withCronHeartbeat('process-queue', vi.fn().mockResolvedValue(okRes()))(req())
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/process-queue')
  })

  it('ignores the header on a 4xx, which never pings either way', async () => {
    const denied = new Response(null, { status: 401, headers: { [CRON_SLO_BREACH_HEADER]: 'x' } })
    await withCronHeartbeat('process-queue', vi.fn().mockResolvedValue(denied))(req())
    expect(fetchMock).not.toHaveBeenCalled()
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

// ── LIVE-548 / ADR-1574: a rejected ping for a MONITORED job is a signal, not a line ────────────
//
// OWN-070: two of the twenty monitored crons 404ed on every ping for two weeks, into warn lines
// nobody queried. For those two weeks their dead-man's switch was dead and nothing said so. These
// tests pin the escalation and, more importantly, its two edges: an opt-out that still pings gets
// the warn line and NOTHING else (its 404 is the expected one), and the event fires once per job
// per process, so a dead monitor is one Sentry issue and not one per run.
describe('withCronHeartbeat — a monitored job whose ping does not land escalates to Sentry', () => {
  const monitored = CRON_MONITORED[0] // process-queue
  const optedOut = CRON_UNMONITORED[0].job // embed-events

  beforeEach(() => {
    process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  })

  it('the partition the test leans on is the real one', () => {
    expect(monitored).toBe('process-queue')
    expect(CRON_MONITORED).not.toContain(optedOut)
  })

  it('a rejected ping (non-2xx) for a monitored job captures a Sentry message tagged by job', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const res = await withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))(req())

    expect(res.status).toBe(200) // the cron's own outcome is untouched
    expect(captureMessage).toHaveBeenCalledOnce()
    const [message, ctx] = captureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain(monitored)
    expect(message).toContain('404')
    expect(ctx).toMatchObject({
      level: 'error',
      tags: { route: `cron.${monitored}`, cron_job: monitored },
      extra: { status: 404 },
    })
  })

  it('a transport failure for a monitored job escalates too, with no status', async () => {
    fetchMock.mockRejectedValue(new Error('monitor unreachable'))
    await withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))(req())

    expect(captureMessage).toHaveBeenCalledOnce()
    const [message, ctx] = captureMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain('monitor unreachable')
    expect(ctx).toMatchObject({ extra: { status: null } })
  })

  it('THE CONTROL: an opt-out that still pings gets the warn line and no Sentry event', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let lines: string[] = []
    try {
      await withCronHeartbeat(optedOut, vi.fn().mockResolvedValue(okRes()))(req())
      lines = [...warn.mock.calls, ...logSpy.mock.calls].flat().filter((a): a is string => typeof a === 'string')
    } finally {
      warn.mockRestore()
      logSpy.mockRestore()
    }
    expect(captureMessage).not.toHaveBeenCalled()
    // The record survives: the same line as before, so one query still finds every rejection.
    expect(lines.some((l) => l.includes('cron.heartbeat.ping_failed'))).toBe(true)
  })

  it('escalates once per job per process, not once per run', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const wrapped = withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))
    await wrapped(req())
    await wrapped(req())
    await wrapped(req())
    expect(captureMessage).toHaveBeenCalledOnce()

    // A different monitored job is its own issue.
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    await withCronHeartbeat(CRON_MONITORED[1], vi.fn().mockResolvedValue(okRes()))(req())
    expect(captureMessage).toHaveBeenCalledTimes(2)
  })

  it('a ping that lands escalates nothing', async () => {
    await withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))(req())
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('the fail-ping path escalates as well, and says it was the /fail ping', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    await withCronHeartbeat(monitored, vi.fn().mockResolvedValue(errRes()))(req())
    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage.mock.calls[0][1]).toMatchObject({ tags: { heartbeat_fail: 'true' } })
  })

  it('a monitored job silenced by CRON_HEARTBEAT_SKIP is named once, and pings nothing', async () => {
    process.env.CRON_HEARTBEAT_SKIP = monitored
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    let lines: string[] = []
    try {
      const wrapped = withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))
      await wrapped(req())
      await wrapped(req())
      lines = [...warn.mock.calls, ...logSpy.mock.calls].flat().filter((a): a is string => typeof a === 'string')
    } finally {
      warn.mockRestore()
      logSpy.mockRestore()
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
    expect(lines.filter((l) => l.includes('cron.heartbeat.monitored_but_skipped'))).toHaveLength(1)
  })

  it('never lets the escalation take the cron down', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    captureMessage.mockImplementation(() => {
      throw new Error('sentry exploded')
    })
    const res = await withCronHeartbeat(monitored, vi.fn().mockResolvedValue(okRes()))(req())
    expect(res.status).toBe(200)
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
