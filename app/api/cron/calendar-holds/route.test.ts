import { afterEach, describe, expect, it, vi } from 'vitest'

// LIVE-1709. The route is off until CALENDAR_HOLDS_ENABLED is set, says so when it skips, and
// refuses an unauthorised call before it does anything else.

const sweep = vi.fn(async () => ({ released: 1, warned: 0, nudged: 0, quiet: 0, failed: 0, remaining: 0 }))
vi.mock('@/lib/calendar/hold-lapse', () => ({ runCalendarHoldSweep: sweep }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({ withCronHeartbeat: (_job: string, h: unknown) => h }))
const denied = vi.fn<() => Response | null>(() => null)
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => denied() }))

async function call() {
  const { GET } = await import('./route')
  return (GET as unknown as (r: Request) => Promise<Response>)(new Request('http://localhost/api/cron/calendar-holds'))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  sweep.mockClear()
  denied.mockReset()
  denied.mockReturnValue(null)
})

describe('/api/cron/calendar-holds', () => {
  it('skips, and says it skipped, while the switch is off', async () => {
    vi.stubEnv('CALENDAR_HOLDS_ENABLED', '')
    const res = await call()
    expect(await res.json()).toMatchObject({ ok: true, skipped: true })
    expect(sweep).not.toHaveBeenCalled()
  })

  it('runs the sweep with a budget when the switch is on', async () => {
    vi.stubEnv('CALENDAR_HOLDS_ENABLED', 'on')
    const res = await call()
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, released: 1 })
    expect(body.budget).toBeDefined()
    expect(sweep).toHaveBeenCalledTimes(1)
  })

  it('answers 401 before anything else', async () => {
    vi.stubEnv('CALENDAR_HOLDS_ENABLED', '1')
    denied.mockReturnValue(new Response('no', { status: 401 }))
    const res = await call()
    expect(res.status).toBe(401)
    expect(sweep).not.toHaveBeenCalled()
  })
})
