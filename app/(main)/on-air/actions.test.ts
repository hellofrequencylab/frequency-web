import { describe, it, expect, vi, beforeEach } from 'vitest'

// completeSession (ADR-229): the finish path of a sit. What is locked here (scan2 L5-08):
//
//   1. THE HISTORY ROW GATES THE ECONOMY. `practice_sessions` is the record the Airtime stat and
//      the member's history are summed from. When that insert is refused, the action returns
//      { error } and NOTHING downstream runs: no logPractice (Zaps / streak), no prefs write, no
//      timer-row delete. The member sees the existing "did not save" screen and can retry with
//      the same args, so a refused write can never become a paid-but-unrecorded sit.
//   2. ON SUCCESS THE ORDER IS UNCHANGED: history row first, then the log, then the reveal reads.
//
// Network-free: auth, the admin client, and every engine the reveal reads are stubbed.

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  logPractice: vi.fn(),
  getPracticesToLogToday: vi.fn(),
  getPracticeDepthContext: vi.fn(),
  getPracticeStreak: vi.fn(),
  resolveMemberDay: vi.fn(),
  getOrCreateDispatch: vi.fn(),
  getNextGathering: vi.fn(),
  loadOnAirSessionData: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/practices', () => ({
  logPractice: mocks.logPractice,
  getPracticesToLogToday: mocks.getPracticesToLogToday,
  getPracticeDepthContext: mocks.getPracticeDepthContext,
}))
vi.mock('@/lib/practice-streak', () => ({ getPracticeStreak: mocks.getPracticeStreak }))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: mocks.resolveMemberDay }))
vi.mock('@/lib/vera-dispatch', () => ({ getOrCreateDispatch: mocks.getOrCreateDispatch }))
vi.mock('@/lib/quest/next-gathering', () => ({ getNextGathering: mocks.getNextGathering }))
vi.mock('@/lib/on-air/session-data', () => ({ loadOnAirSessionData: mocks.loadOnAirSessionData }))

// ── A recording admin client. Every call is logged as `<table>.<op>` in order, and each table's
// terminal result (insert / update / delete / select) can be set per test. ─────────────────────
type Terminal = { data?: unknown; error?: { message: string } | null; count?: number | null }
const calls: string[] = []
const results: Record<string, Terminal> = {}

function terminal(key: string): Terminal {
  return { data: null, error: null, count: 0, ...(results[key] ?? {}) }
}

function chain(table: string, op: string) {
  const key = `${table}.${op}`
  const api: Record<string, unknown> = {}
  const self = () => api
  for (const m of ['eq', 'gte', 'order', 'limit', 'is', 'select']) api[m] = self
  api.maybeSingle = async () => terminal(key)
  api.then = (resolve: (r: Terminal) => unknown) => Promise.resolve(resolve(terminal(key)))
  return api
}

function builder(table: string) {
  return {
    insert: (row: unknown) => {
      calls.push(`${table}.insert`)
      void row
      return chain(table, 'insert')
    },
    update: () => {
      calls.push(`${table}.update`)
      return chain(table, 'update')
    },
    delete: () => {
      calls.push(`${table}.delete`)
      return chain(table, 'delete')
    },
    select: () => {
      calls.push(`${table}.select`)
      return chain(table, 'select')
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { completeSession } from './actions'

const ME = 'profile-me'
const PRACTICE = 'practice-1'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  for (const k of Object.keys(results)) delete results[k]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.getMyProfileId.mockResolvedValue(ME)
  mocks.logPractice.mockResolvedValue({ logged: true, zapsAwarded: 5 })
  mocks.getPracticesToLogToday.mockResolvedValue([])
  mocks.getPracticeDepthContext.mockResolvedValue({ depthStreak: 0 })
  mocks.getPracticeStreak.mockResolvedValue({ current: 1, longest: 1, freezeTokens: 0, nextMilestone: 7, toNext: 6 })
  mocks.resolveMemberDay.mockResolvedValue('2026-09-05')
  mocks.getOrCreateDispatch.mockResolvedValue({ copy: 'x', actionHref: '/feed', actionLabel: 'Feed' })
  mocks.getNextGathering.mockResolvedValue(null)
  results['practices.select'] = { data: { uses_timer: false, duration_min: 5, title: 'Breathe' } }
})

/** A plain Just Log sit: no timer proof needed, so the economy is reached on the happy path. */
const input = { practiceId: PRACTICE, mode: 'log' as const, pattern: null, seconds: 300, startedAt: null }

describe('completeSession', () => {
  it('REFUSED HISTORY ROW: returns { error } and runs no economy, no prefs write, no timer delete', async () => {
    results['practice_sessions.insert'] = { error: { message: 'column "note" does not exist' } }

    const res = await completeSession(input)

    expect(res).toEqual({ error: 'Could not log this sit. Try again.' })
    expect(mocks.logPractice).not.toHaveBeenCalled()
    expect(mocks.getPracticeStreak).not.toHaveBeenCalled()
    // The insert was the ONLY write attempted: nothing downstream of it touched the database.
    expect(calls).toEqual(['practice_sessions.insert'])
  })

  it('LANDED HISTORY ROW: the log runs after the insert and the reveal carries logged: true', async () => {
    const res = await completeSession(input)

    expect('data' in res && res.data.logged).toBe(true)
    expect(mocks.logPractice).toHaveBeenCalledTimes(1)
    expect(mocks.logPractice.mock.calls[0]?.[0]).toMatchObject({ profileId: ME, practiceId: PRACTICE })
    // Order: the history row is the FIRST call, and the economy is reached only after it.
    expect(calls[0]).toBe('practice_sessions.insert')
    expect(calls).toContain('practice_timer_sessions.delete')
  })
})
