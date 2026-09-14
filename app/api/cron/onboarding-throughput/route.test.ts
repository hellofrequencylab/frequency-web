import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// LIVE-311. The onboarding-throughput cron against its REAL auth gate and REAL heartbeat wrapper,
// with only the database, Sentry and the log mocked. What it pins: a request without the bearer is
// refused and NOT heartbeat-pinged; an authorised run walks the auth pages with the declared budget,
// joins the active users to their profiles, classifies them by the gate's own predicate, reports the
// stuck profile ids (never emails) on a WARN line, answers 200 even when the count is non-zero, and
// pings the monitor once; a read failure answers 500 and fail-pings.

const state = vi.hoisted(() => {
  // cron-auth reads CRON_SECRET at module load, so the value has to be in place before the import.
  process.env.CRON_SECRET = 'test-cron-secret'
  return {
    userPages: [] as Array<Array<{ id: string; last_sign_in_at: string | null; email?: string }>>,
    profiles: [] as Array<Record<string, unknown>>,
    listError: null as { message: string } | null,
    perPages: [] as number[],
    inFilters: [] as string[][],
    warns: [] as Array<{ event: string; fields: Record<string, unknown> | undefined }>,
    infos: [] as Array<{ event: string; fields: Record<string, unknown> | undefined }>,
  }
})

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  withScope: (fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/tags', () => ({ setObservabilityTags: () => {} }))
vi.mock('@/lib/log', () => ({
  log: {
    info: (event: string, fields?: Record<string, unknown>) => { state.infos.push({ event, fields }) },
    warn: (event: string, fields?: Record<string, unknown>) => { state.warns.push({ event, fields }) },
    error: () => {},
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async ({ page, perPage }: { page: number; perPage: number }) => {
          state.perPages.push(perPage)
          if (state.listError) return { data: null, error: state.listError }
          return { data: { users: state.userPages[page - 1] ?? [] }, error: null }
        },
      },
    },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          in: (col: string, ids: string[]) => {
            expect(col).toBe('auth_user_id')
            state.inFilters.push(ids)
            return Promise.resolve({
              data: state.profiles.filter((p) => ids.includes(p.auth_user_id as string)),
              error: null,
            })
          },
        }),
      }
    },
  }),
}))

import { GET } from './route'

const NOW = Date.now()
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const authed = () =>
  new Request('http://localhost/api/cron/onboarding-throughput', {
    headers: { authorization: 'Bearer test-cron-secret' },
  })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  state.userPages = []
  state.profiles = []
  state.listError = null
  state.perPages = []
  state.inFilters = []
  state.warns = []
  state.infos = []
  process.env.CRON_HEARTBEAT_BASE_URL = 'https://hc.example/ping'
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CRON_HEARTBEAT_BASE_URL
})

describe('GET /api/cron/onboarding-throughput', () => {
  it('refuses a request without the cron secret, and does not ping the monitor for it', async () => {
    const res = await GET(new Request('http://localhost/api/cron/onboarding-throughput'))
    expect(res.status).toBe(401)
    expect(state.perPages).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the stuck profile ids on a WARN line, answers 200, and pings the heartbeat once', async () => {
    state.userPages = [[
      { id: 'auth-stuck', last_sign_in_at: daysAgo(1), email: 'stuck@example.com' },
      { id: 'auth-done', last_sign_in_at: daysAgo(2), email: 'done@example.com' },
      { id: 'auth-seeded', last_sign_in_at: daysAgo(2), email: 'seeded@example.com' },
      { id: 'auth-fresh', last_sign_in_at: daysAgo(0.5), email: 'fresh@example.com' },
      { id: 'auth-dormant', last_sign_in_at: daysAgo(45), email: 'dormant@example.com' },
      { id: 'auth-never', last_sign_in_at: null, email: 'never@example.com' },
    ]]
    state.profiles = [
      { id: 'p-stuck', auth_user_id: 'auth-stuck', created_at: daysAgo(56), meta: {}, current_season_zaps: 0, lifetime_gems: 0 },
      { id: 'p-done', auth_user_id: 'auth-done', created_at: daysAgo(56), meta: { onboarding_completed: true }, current_season_zaps: 0, lifetime_gems: 0 },
      // The gate admits a seeded member on earned Gems alone, so the probe must too.
      { id: 'p-seeded', auth_user_id: 'auth-seeded', created_at: daysAgo(200), meta: {}, current_season_zaps: 0, lifetime_gems: 12 },
      { id: 'p-fresh', auth_user_id: 'auth-fresh', created_at: daysAgo(1), meta: {}, current_season_zaps: 0, lifetime_gems: 0 },
      { id: 'p-dormant', auth_user_id: 'auth-dormant', created_at: daysAgo(56), meta: {}, current_season_zaps: 0, lifetime_gems: 0 },
    ]

    const res = await GET(authed())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      stuck: ['p-stuck'],
      counts: { stuck: 1, completed: 2, fresh: 1, dormant: 0 },
      active_users: 4,
      complete: true,
    })
    expect(body.budget).toMatchObject({ budget_items: 1000, remaining: 0, more: false })

    // Only active users reach the profiles read: the dormant and never-signed-in accounts are
    // filtered on the auth side, so the dormant count is 0 here and the join is 4 ids.
    expect(state.perPages).toEqual([1000])
    expect(state.inFilters).toEqual([['auth-stuck', 'auth-done', 'auth-seeded', 'auth-fresh']])

    const warn = state.warns.find((w) => w.event === 'onboarding.throughput.stuck')
    expect(warn?.fields).toMatchObject({ count: 1, profile_ids: ['p-stuck'] })
    // Profile ids only: no email and no auth id anywhere in the reading.
    expect(JSON.stringify([body, warn])).not.toMatch(/@example\.com|auth-stuck/)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/onboarding-throughput')
  })

  it('a clean reading logs the counts and no WARN line', async () => {
    state.userPages = [[{ id: 'auth-done', last_sign_in_at: daysAgo(1) }]]
    state.profiles = [
      { id: 'p-done', auth_user_id: 'auth-done', created_at: daysAgo(56), meta: { onboarding_completed: true }, current_season_zaps: 0, lifetime_gems: 0 },
    ]
    const res = await GET(authed())
    expect(res.status).toBe(200)
    expect((await res.json()).stuck).toEqual([])
    expect(state.warns).toEqual([])
    expect(state.infos.find((l) => l.event === 'cron.onboarding_throughput.counts')?.fields).toMatchObject({
      stuck: 0,
      completed: 1,
      active_users: 1,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('walks every auth page until a short one, then joins the profiles in one read', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, last_sign_in_at: daysAgo(400) }))
    state.userPages = [full, [{ id: 'auth-stuck', last_sign_in_at: daysAgo(3) }]]
    state.profiles = [
      { id: 'p-stuck', auth_user_id: 'auth-stuck', created_at: daysAgo(30), meta: {}, current_season_zaps: 0, lifetime_gems: 0 },
    ]
    const res = await GET(authed())
    expect(state.perPages).toEqual([1000, 1000])
    expect(state.inFilters).toEqual([['auth-stuck']])
    expect(await res.json()).toMatchObject({ stuck: ['p-stuck'], active_users: 1, complete: true })
  })

  it('answers 500 and fail-pings when the auth read fails', async () => {
    state.listError = { message: 'auth admin unavailable' }
    const res = await GET(authed())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'onboarding throughput read failed' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://hc.example/ping/onboarding-throughput/fail')
  })
})
