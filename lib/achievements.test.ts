import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase C4 wiring tests. The concurrency safety (advisory locks, one-tick-per-week dedup, the
// atomic increment + completion transition) lives in the advance_challenge_progress /
// record_streak_tick RPCs and is verified against Postgres, not here. These lock the app-side
// wiring: the streak/challenge advance goes THROUGH the RPC, the streak_update event fires only
// on a real tick, and the challenge purse is paid once (claim-then-pay) only on a fresh completion.

type Result = { data: unknown; error: { message: string } | null }

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
const fromTables: string[] = []
const rewardGrantInserts: Array<Record<string, unknown>> = []
const rewardGrantDeletes: number[] = []
const awardZapsCalls: Array<{ profileId: string; amount: number }> = []
const awardGemsCalls: Array<{ profileId: string; action: string; amount?: number }> = []

let rpcResults: Record<string, Result> = {}
let tableData: Record<string, Result> = {}
let rewardGrantInsertError: { message: string } | null = null
let awardZapsResult = { awarded: true, amount: 0 }
let awardGemsResult = { awarded: true, amount: 0, capped: false }

// A chainable/thenable stand-in for a supabase-js query builder: every method returns the same
// proxy (so `.select().eq().not()...` chains), `.maybeSingle()/.single()` resolve the result, and
// awaiting the chain resolves it too.
function chain(resultFn: () => Result): Record<string, unknown> {
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(resultFn()).then(res, rej)
        }
        if (prop === 'maybeSingle' || prop === 'single') return async () => resultFn()
        return () => proxy
      },
    },
  )
  return proxy
}

function fromImpl(table: string) {
  fromTables.push(table)
  return {
    select: () => chain(() => tableData[table] ?? { data: [], error: null }),
    insert: (payload: Record<string, unknown>) => {
      if (table === 'reward_grants') {
        rewardGrantInserts.push(payload)
        return chain(() => ({ data: null, error: rewardGrantInsertError }))
      }
      return chain(() => ({ data: null, error: null }))
    },
    update: () => chain(() => ({ data: null, error: null })),
    delete: () => {
      if (table === 'reward_grants') rewardGrantDeletes.push(1)
      return chain(() => ({ data: null, error: null }))
    },
  }
}

const admin = {
  from: fromImpl,
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    return rpcResults[fn] ?? { data: null, error: null }
  },
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/zaps', () => ({
  awardZaps: async (profileId: string, amount: number) => {
    awardZapsCalls.push({ profileId, amount })
    return awardZapsResult
  },
}))
vi.mock('@/lib/gems', () => ({
  awardGems: async (profileId: string, action: string, amount?: number) => {
    awardGemsCalls.push({ profileId, action, amount })
    return awardGemsResult
  },
}))

import { recordStreakActivity, processGamificationEvent } from '@/lib/achievements'

beforeEach(() => {
  rpcCalls.length = 0
  fromTables.length = 0
  rewardGrantInserts.length = 0
  rewardGrantDeletes.length = 0
  awardZapsCalls.length = 0
  awardGemsCalls.length = 0
  rpcResults = {}
  tableData = {}
  rewardGrantInsertError = null
  awardZapsResult = { awarded: true, amount: 0 }
  awardGemsResult = { awarded: true, amount: 0, capped: false }
})

describe('recordStreakActivity (wiring)', () => {
  it('advances through record_streak_tick with the type window and returns its counts', async () => {
    rpcResults['record_streak_tick'] = { data: { current: 3, longest: 5, ticked: true }, error: null }
    // no achievements/challenges so the fired streak_update event is a harmless no-op
    const r = await recordStreakActivity('p1', 'attendance')
    expect(rpcCalls[0]).toEqual({
      fn: 'record_streak_tick',
      args: { _profile: 'p1', _streak_type: 'attendance', _window_days: 9 },
    })
    expect(r).toEqual({ current: 3, longest: 5 })
  })

  it('fires the streak_update milestone check only on a real tick', async () => {
    rpcResults['record_streak_tick'] = { data: { current: 2, longest: 2, ticked: true }, error: null }
    await recordStreakActivity('p1', 'posting')
    // processGamificationEvent ran → it queried the achievements table
    expect(fromTables).toContain('achievements')
  })

  it('does not fire the milestone check when the week is already ticked', async () => {
    rpcResults['record_streak_tick'] = { data: { current: 4, longest: 6, ticked: false }, error: null }
    const r = await recordStreakActivity('p1', 'attendance')
    expect(r).toEqual({ current: 4, longest: 6 })
    expect(fromTables).not.toContain('achievements') // processGamificationEvent never ran
  })

  it('stays quiet and returns 0/0 on an RPC error', async () => {
    rpcResults['record_streak_tick'] = { data: null, error: { message: 'boom' } }
    const r = await recordStreakActivity('p1', 'hosting')
    expect(r).toEqual({ current: 0, longest: 0 })
    expect(fromTables).not.toContain('achievements')
  })
})

describe('challenge advancement (wiring via processGamificationEvent)', () => {
  const challenge = {
    id: 'c1',
    criteria: { type: 'post_create' },
    target: 5,
    valid_from: null,
    valid_until: null,
    zaps_reward: 100,
  }

  it('pays the purse once (claim-then-pay) when advance reports just_completed', async () => {
    tableData['achievements'] = { data: [], error: null } // skip achievement eval
    tableData['season_challenges'] = { data: [challenge], error: null }
    tableData['challenge_progress'] = { data: [], error: null } // completionist sweep no-op
    rpcResults['advance_challenge_progress'] = {
      data: { current: 5, completed: true, just_completed: true },
      error: null,
    }

    await processGamificationEvent({ type: 'post_create', profileId: 'p1' })

    expect(rpcCalls.some((c) => c.fn === 'advance_challenge_progress')).toBe(true)
    // claim written with the challenge rule_key, in the gem currency (post_create is on-platform)
    expect(rewardGrantInserts).toHaveLength(1)
    expect(rewardGrantInserts[0]).toMatchObject({ rule_key: 'challenge:c1:p1', reward_kind: 'gems', amount: 100 })
    expect(awardGemsCalls).toHaveLength(1)
    expect(rewardGrantDeletes).toHaveLength(0) // pay succeeded → claim kept
  })

  it('does not pay when the challenge is not newly completed', async () => {
    tableData['achievements'] = { data: [], error: null }
    tableData['season_challenges'] = { data: [challenge], error: null }
    rpcResults['advance_challenge_progress'] = {
      data: { current: 3, completed: false, just_completed: false },
      error: null,
    }

    await processGamificationEvent({ type: 'post_create', profileId: 'p1' })

    expect(rpcCalls.some((c) => c.fn === 'advance_challenge_progress')).toBe(true)
    expect(rewardGrantInserts).toHaveLength(0)
    expect(awardGemsCalls).toHaveLength(0)
  })

  it('releases the claim when the currency award fails (no claimed-but-unpaid)', async () => {
    tableData['achievements'] = { data: [], error: null }
    tableData['season_challenges'] = { data: [challenge], error: null }
    tableData['challenge_progress'] = { data: [], error: null }
    rpcResults['advance_challenge_progress'] = {
      data: { current: 5, completed: true, just_completed: true },
      error: null,
    }
    awardGemsResult = { awarded: false, amount: 0, capped: false } // ledger write failed

    await processGamificationEvent({ type: 'post_create', profileId: 'p1' })

    expect(rewardGrantInserts).toHaveLength(1)
    expect(rewardGrantDeletes).toHaveLength(1) // claim released so a retry can re-pay
  })
})
