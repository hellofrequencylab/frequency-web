import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE RAIL'S OWN RUNG (LIVE-101). game-stats-dock.test.tsx proves the dock CAN emit a frozen
// day; this proves the rail actually FEEDS it one. The two are separable failures and the second
// is the one that shipped: `last7` was assembled from `practice_logs` alone, so a day the reserve
// bridged or a rest window covered — neither of which writes a log row — arrived as an absence.
// Every dependency is mocked, so what is under test is exactly loadGameStats's assembly: it must
// read `profiles.meta` and run it through the shared frozen-day definition.

const TODAY = '2026-06-06'
const day = (n: number) => new Date(Date.UTC(2026, 5, 6 - n)).toISOString().slice(0, 10)

let profileRow: Record<string, unknown> | null = null
let logs: { logged_for: string }[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/practices', () => ({
  getPracticesToLogToday: async () => [],
  getMemberPractices: async () => [],
  getRecentPracticeLogs: async () => logs,
}))
vi.mock('@/lib/quest/completion-read', () => ({ journeysFinishedThisSeason: async () => 1 }))
vi.mock('@/lib/journeys/progress', () => ({ getMemberJourneyProgress: async () => [] }))
vi.mock('@/lib/store/balance', () => ({ getSpendableBalance: async () => 0 }))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: async () => TODAY }))

const load = async () => {
  const { loadGameStats } = await import('./right-sidebar')
  return loadGameStats('profile-1')
}

beforeEach(() => {
  vi.resetModules()
  profileRow = { current_season_zaps: 10, lifetime_gems: 5, current_streak: 7, meta: null }
  logs = []
})

describe('loadGameStats assembles a TRI-state day run', () => {
  it('paints a reserve-bridged day as frozen, not as the miss the logs alone would show', async () => {
    profileRow = { ...profileRow, meta: { practiceStreak: { frozenDates: [day(3)] } } }
    logs = [day(6), day(5), day(4), day(2), day(1), day(0)].map((d) => ({ logged_for: d }))
    const { last7 } = await load()
    expect(last7).toEqual(['done', 'done', 'done', 'frozen', 'done', 'done', 'done'])
  })

  it('paints an active rest window as frozen, so a planned break never reads as a slip', async () => {
    profileRow = { ...profileRow, meta: { practiceStreak: { rest: { from: day(3), through: day(1) } } } }
    logs = [day(6), day(5), day(4), day(0)].map((d) => ({ logged_for: d }))
    const { last7 } = await load()
    expect(last7).toEqual(['done', 'done', 'done', 'frozen', 'frozen', 'frozen', 'done'])
  })

  // EQUIVALENCE. A member with no freeze data gets exactly the run the boolean[] version gave
  // them — same days, same order, same states — so nothing about done/missed moved.
  it('is unchanged for a member with no freeze data', async () => {
    logs = [day(6), day(4), day(0)].map((d) => ({ logged_for: d }))
    const { last7 } = await load()
    expect(last7).toEqual(['done', 'missed', 'done', 'missed', 'missed', 'missed', 'done'])
  })

  it('reads the member day, not the server day, for the anchor', async () => {
    logs = [{ logged_for: TODAY }]
    const { last7 } = await load()
    expect(last7[6]).toBe('done')
    expect(last7).toHaveLength(7)
  })
})
