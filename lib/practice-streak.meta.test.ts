import { describe, it, expect, vi, beforeEach } from 'vitest'

// The WRITE half of lib/practice-streak (scan2 L6-09). Every writer here used to spread the whole
// `meta` it read at the top of the function back over profiles.meta, so a check-in or walkthrough
// stamp landing during the computation was reverted. Now each writer merges ONLY the practiceStreak
// key through merge_profile_meta (the two forward writers also carry current_streak / longest_streak
// as p_columns, in the same statement), and reads the result. The pure date/derivation helpers are
// covered in practice-streak.test.ts; this file is the wiring.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  resolveMemberDay: vi.fn(),
  awardZaps: vi.fn(),
  postSystemLine: vi.fn(),
  profileMeta: {} as Record<string, unknown>,
  logs: [] as string[],
  profileUpdates: [] as unknown[],
}))

function selectChain(table: string) {
  const api: Record<string, unknown> = {}
  const self = () => api
  api.eq = self
  api.gte = self
  api.like = self
  api.maybeSingle = async () => {
    if (table === 'profiles') return { data: { meta: mocks.profileMeta, handle: 'sam' }, error: null }
    return { data: null, error: null }
  }
  api.then = (resolve: (r: unknown) => unknown) => {
    if (table === 'practice_logs') return Promise.resolve(resolve({ data: mocks.logs.map((d) => ({ logged_for: d })), error: null }))
    if (table === 'reward_grants') return Promise.resolve(resolve({ data: null, count: 0, error: null }))
    return Promise.resolve(resolve({ data: null, error: null }))
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => selectChain(table),
      insert: async () => ({ error: null }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      update: (payload: unknown) => {
        if (table === 'profiles') mocks.profileUpdates.push(payload)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: mocks.resolveMemberDay }))
vi.mock('@/lib/zaps', () => ({ awardZaps: mocks.awardZaps }))
vi.mock('@/lib/system-line', () => ({ postSystemLine: mocks.postSystemLine }))

import {
  recordPracticeStreak,
  recomputePracticeStreakAfterUnlog,
  saveStreakWithFreeze,
  revertStreakSave,
  grantStreakFreeze,
  setStreakPause,
  clearStreakPause,
} from './practice-streak'

const TODAY = '2026-09-05'
const YESTERDAY = '2026-09-04'

function lastRpc() {
  const call = mocks.rpc.mock.calls.at(-1) as [string, Record<string, unknown>] | undefined
  if (!call) throw new Error('no rpc call')
  return { name: call[0], args: call[1] }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.resolveMemberDay.mockResolvedValue(TODAY)
  mocks.awardZaps.mockResolvedValue({ awarded: true })
  mocks.profileUpdates.length = 0
  mocks.logs = [TODAY, YESTERDAY]
  // A sibling key rides in the read on purpose: it must NEVER reach the write.
  mocks.profileMeta = {
    daily_checkin_date: YESTERDAY,
    walkthroughs: { welcome: { seenAt: 't' } },
    practiceStreak: { freezeTokens: 1, frozenDates: [], milestonesPaid: [], longest: 1, fullDayFreezesApplied: 0, rest: null },
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordPracticeStreak', () => {
  it('merges ONLY practiceStreak, with the two mirror columns, and never updates profiles through .from()', async () => {
    await recordPracticeStreak('p1')
    const { name, args } = lastRpc()
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('p1')
    expect(Object.keys(args.p_patch as object)).toEqual(['practiceStreak'])
    expect((args.p_patch as { practiceStreak: { current: number } }).practiceStreak.current).toBe(2)
    expect(args.p_columns).toEqual({ current_streak: 2, longest_streak: 2 })
    expect(mocks.profileUpdates).toEqual([])
  })

  it('logs a failed merge with a structured argument and does not throw', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(recordPracticeStreak('p1')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[recordPracticeStreak]'), { profileId: 'p1', error: 'boom' })
  })
})

describe('recomputePracticeStreakAfterUnlog', () => {
  it('merges ONLY practiceStreak with the mirror columns', async () => {
    mocks.logs = [TODAY, YESTERDAY]
    await recomputePracticeStreakAfterUnlog('p1')
    const { args } = lastRpc()
    expect(Object.keys(args.p_patch as object)).toEqual(['practiceStreak'])
    // today's log is dropped by the recompute, so the count is yesterday alone
    expect(args.p_columns).toEqual({ current_streak: 1, longest_streak: 1 })
    expect(mocks.profileUpdates).toEqual([])
  })
})

describe('saveStreakWithFreeze / revertStreakSave', () => {
  it('spends the freeze through a practiceStreak-only merge', async () => {
    mocks.logs = [YESTERDAY]
    const res = await saveStreakWithFreeze('p1')
    expect(res.saved).toBe(true)
    const { args } = lastRpc()
    expect(Object.keys(args.p_patch as object)).toEqual(['practiceStreak'])
    expect('p_columns' in args).toBe(false)
  })

  it('reports write_failed (not saved, freeze intact) when the merge did not land', async () => {
    mocks.logs = [YESTERDAY]
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await saveStreakWithFreeze('p1')
    expect(res).toEqual({ saved: false, bridgedDay: null, freezeTokens: 1, reason: 'write_failed' })
  })

  it('revert returns reverted:false when the merge did not land', async () => {
    mocks.profileMeta = { ...mocks.profileMeta, practiceStreak: { freezeTokens: 0, frozenDates: [TODAY], milestonesPaid: [], longest: 1 } }
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await revertStreakSave('p1', TODAY)).toEqual({ reverted: false })
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
    expect(await revertStreakSave('p1', TODAY)).toEqual({ reverted: true })
    expect(Object.keys(lastRpc().args.p_patch as object)).toEqual(['practiceStreak'])
  })
})

describe('grantStreakFreeze', () => {
  it('banks the token through a practiceStreak-only merge', async () => {
    const res = await grantStreakFreeze('p1')
    expect(res).toEqual({ granted: true, freezeTokens: 2, atCap: false })
    expect(Object.keys(lastRpc().args.p_patch as object)).toEqual(['practiceStreak'])
  })

  it('THROWS when the merge did not land, so the store refunds instead of reporting a token that was never banked', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(grantStreakFreeze('p1')).rejects.toThrow(/merge failed/)
  })
})

describe('setStreakPause / clearStreakPause', () => {
  it('writes the rest window inside practiceStreak only', async () => {
    const res = await setStreakPause('p1', 3)
    expect(res.rest).toEqual({ from: TODAY, through: '2026-09-07' })
    const patch = lastRpc().args.p_patch as { practiceStreak: { rest: unknown } }
    expect(Object.keys(patch)).toEqual(['practiceStreak'])
    expect(patch.practiceStreak.rest).toEqual(res.rest)
  })

  it('both throw when the merge did not land, so the action reports it instead of revalidating', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(setStreakPause('p1', 3)).rejects.toThrow(/merge failed/)
    mocks.profileMeta = { ...mocks.profileMeta, practiceStreak: { freezeTokens: 1, frozenDates: [], milestonesPaid: [], longest: 1, rest: { from: YESTERDAY, through: TODAY } } }
    await expect(clearStreakPause('p1')).rejects.toThrow(/merge failed/)
  })
})
