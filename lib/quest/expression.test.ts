import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-767: completeExpressionChallenge paid the Expression capstone (50 Zaps at a Circle,
// 30 Gems online) for ANY Journey in the season, enrolled or not, so a new member could tap
// "At a Circle" on every seeded Expression Challenge and bank ~350 season Zaps for Journeys
// they never started. These pin the gate against an in-memory admin fake (modeled on
// lib/quest/complete.test.ts):
//
//   1. no journey_enrollments row: nothing is claimed, nothing is paid, found stays true
//   2. an enrolled member is paid exactly once on the circle path
//   3. an enrolled member is paid the Gem purse on the online path

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const PROFILE = 'P'
const JOURNEY = 'J'
const store: Store = {}

const hoisted = vi.hoisted(() => ({
  awardZaps: vi.fn(async () => ({ awarded: true, amount: 50 })),
  tryCompleteJourney: vi.fn(async () => ({ completed: false })),
}))

function tbl(t: string): Row[] {
  return (store[t] ??= [])
}

function from(table: string) {
  const filters: Array<[string, unknown]> = []
  const match = (r: Row) => filters.every(([c, v]) => r[c] === v)
  const thenable = (result: { data: unknown; error: unknown }): Record<string, unknown> => ({
    select: () => thenable(result),
    eq: () => thenable(result),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  })
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return api
    },
    limit: () => api,
    async maybeSingle() {
      return { data: tbl(table).filter(match)[0] ?? null, error: null }
    },
    insert: (payload: Row) => {
      if (table === 'reward_grants') {
        const dup = tbl('reward_grants').some(
          (r) => r.rule_key === payload.rule_key && r.profile_id === payload.profile_id,
        )
        if (dup) return thenable({ data: null, error: { code: '23505', message: 'duplicate' } })
      }
      tbl(table).push({ id: `${table}-${tbl(table).length}`, ...payload })
      return thenable({ data: null, error: null })
    },
    update: (payload: Row) => ({
      eq: (c: string, v: unknown) => {
        filters.push([c, v])
        return {
          then: (resolve: (v: unknown) => unknown) => {
            for (const r of tbl(table)) if (match(r)) Object.assign(r, payload)
            return Promise.resolve({ data: null, error: null }).then(resolve)
          },
        }
      },
    }),
    delete: () => ({
      eq: (c: string, v: unknown) => {
        filters.push([c, v])
        return {
          eq: (c2: string, v2: unknown) => {
            filters.push([c2, v2])
            return {
              then: (resolve: (v: unknown) => unknown) => {
                store[table] = tbl(table).filter((r) => !match(r))
                return Promise.resolve({ data: null, error: null }).then(resolve)
              },
            }
          },
        }
      },
    }),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => from(t) }) }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: async () => ({ season_number: 1 }) }))
vi.mock('@/lib/zaps', () => ({ awardZaps: hoisted.awardZaps }))
vi.mock('@/lib/quest/complete', () => ({ tryCompleteJourney: hoisted.tryCompleteJourney }))

import { completeExpressionChallenge } from '@/lib/quest/expression'

const CIRCLE_KEY = `expression.circle:${PROFILE}:${JOURNEY}:1`

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  store.season_challenges = [{ id: 'SC', journey_id: JOURNEY, season: 1 }]
  store.challenge_progress = []
  store.reward_grants = []
  store.gem_transactions = []
  store.journey_enrollments = []
  hoisted.awardZaps.mockClear()
  hoisted.tryCompleteJourney.mockClear()
})

describe('completeExpressionChallenge requires an enrollment in the Journey (SCAN-767)', () => {
  it('refuses a member who never enrolled: nothing marked, claimed or paid', async () => {
    const r = await completeExpressionChallenge(PROFILE, JOURNEY, { mode: 'circle' })
    expect(r).toEqual({ ok: false, found: true, zaps: 0, gems: 0 })
    expect(tbl('challenge_progress')).toEqual([])
    expect(tbl('reward_grants')).toEqual([])
    expect(hoisted.awardZaps).not.toHaveBeenCalled()
    expect(hoisted.tryCompleteJourney).not.toHaveBeenCalled()
  })

  it('refuses on the online path too: no Gem grant for a Journey the member is not on', async () => {
    const r = await completeExpressionChallenge(PROFILE, JOURNEY, { mode: 'online' })
    expect(r.ok).toBe(false)
    expect(r.gems).toBe(0)
    expect(tbl('gem_transactions')).toEqual([])
  })

  it('pays an enrolled member exactly once at a Circle', async () => {
    store.journey_enrollments.push({ id: 'E', profile_id: PROFILE, plan_id: JOURNEY, run_id: null })
    const r = await completeExpressionChallenge(PROFILE, JOURNEY, { mode: 'circle' })
    expect(r).toMatchObject({ ok: true, found: true, zaps: 50 })
    expect(tbl('reward_grants').filter((g) => g.rule_key === CIRCLE_KEY)).toHaveLength(1)
    expect(hoisted.awardZaps).toHaveBeenCalledTimes(1)

    const again = await completeExpressionChallenge(PROFILE, JOURNEY, { mode: 'circle' })
    expect(again).toMatchObject({ ok: true, zaps: 0 })
    expect(hoisted.awardZaps).toHaveBeenCalledTimes(1)
  })

  it('pays an enrolled member the Gem purse online', async () => {
    store.journey_enrollments.push({ id: 'E', profile_id: PROFILE, plan_id: JOURNEY, run_id: 'R' })
    const r = await completeExpressionChallenge(PROFILE, JOURNEY, { mode: 'online' })
    expect(r).toMatchObject({ ok: true, found: true, gems: 30 })
    expect(tbl('gem_transactions')).toHaveLength(1)
  })
})
