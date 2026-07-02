import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase C5 — the journey-finish +75 Zap purse now rides its OWN claim-then-pay reward_grants
// row (rule_key journey.finish.zaps:{profile}:{journey}:{season}), decoupled from the
// journey_completions lock. These lock the app-side contract against an in-memory admin fake
// (modeled on lib/practices-unlog.test.ts): the concurrency guarantee itself lives in the DB
// UNIQUE(rule_key, profile_id) constraint, which the fake enforces so the claim is a real lock.
//
//   1. fresh completion pays the purse exactly once
//   2. redelivery is a no-op, not a double-pay
//   3. C5 fix: a crash after the completion row but before the award is recoverable on a later call
//   4. delete-on-failure releases the claim so a failed award can re-pay

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const PROFILE = 'P'
const JOURNEY = 'J'
const store: Store = {}

const hoisted = vi.hoisted(() => ({
  awardZapsForAction: vi.fn(async () => ({ awarded: true, amount: 75 })),
}))

function tbl(t: string): Row[] {
  return (store[t] ??= [])
}

// A chainable builder over the per-table store. reward_grants enforces UNIQUE(rule_key,
// profile_id) — a duplicate insert resolves to an error (the claim lock). journey_completions
// upsert(..., { ignoreDuplicates }) returns the inserted row on a fresh insert, [] on conflict.
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
    order: () => api,
    limit: () => api,
    like: () => api,
    gte: () => api,
    lt: () => api,
    async maybeSingle() {
      return { data: tbl(table).filter(match)[0] ?? null, error: null }
    },
    insert: (payload: Row) => {
      if (table === 'reward_grants') {
        const dup = tbl('reward_grants').some(
          (r) => r.rule_key === payload.rule_key && r.profile_id === payload.profile_id,
        )
        if (dup) return thenable({ data: null, error: { message: 'duplicate' } })
      }
      tbl(table).push({ ...payload })
      return thenable({ data: null, error: null })
    },
    upsert: (payload: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const keys = (opts?.onConflict ?? '').split(',').map((k) => k.trim()).filter(Boolean)
      const dup = keys.length > 0 && tbl(table).some((r) => keys.every((k) => r[k] === payload[k]))
      let inserted: Row[] = []
      if (!dup) {
        const row = { id: `${table}-${tbl(table).length}`, ...payload }
        tbl(table).push(row)
        inserted = [{ id: row.id }]
      }
      // ignoreDuplicates → a conflict yields no rows (matches the real .select('id') semantics)
      return thenable({ data: inserted, error: null })
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
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: tbl(table).filter(match), error: null }).then(resolve),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => from(t),
    // certificate capstone RPC: below the bar → no capstone side effects in these tests
    rpc: async () => ({ data: false, error: null }),
  }),
}))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: async () => ({ season_number: 1 }) }))
vi.mock('@/lib/quest/completion', () => ({ evaluateJourneyCompletion: async () => ({ finished: true }) }))
vi.mock('@/lib/quest/completion-read', () => ({ journeysFinishedThisSeason: async () => 1 }))
vi.mock('@/lib/awards/cosmetics', () => ({
  grantJourneyBadgeOnCompletion: async () => false,
  grantStoreItem: async () => false,
}))
vi.mock('@/lib/circles/social-fuel', () => ({ celebrateInCircleFeed: async () => ({}) }))
vi.mock('@/lib/gems', () => ({ awardGems: async () => ({ awarded: false, amount: 0, capped: false }) }))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: hoisted.awardZapsForAction }))

import { tryCompleteJourney } from '@/lib/quest/complete'

const ZAPS_KEY = `journey.finish.zaps:${PROFILE}:${JOURNEY}:1`
const zapGrants = () => tbl('reward_grants').filter((r) => r.rule_key === ZAPS_KEY)

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  store.reward_grants = []
  store.zap_transactions = []
  store.gem_transactions = []
  store.journey_completions = []
  store.journey_plans = []
  store.achievements = []
  store.user_achievements = []
  store.profiles = [{ id: PROFILE, current_season_rank: 'ghost', lifetime_rank: 'ghost', handle: null }]
  hoisted.awardZapsForAction.mockClear()
  hoisted.awardZapsForAction.mockResolvedValue({ awarded: true, amount: 75 })
})

describe('tryCompleteJourney — journey-finish purse (C5)', () => {
  it('pays the purse exactly once on a fresh completion', async () => {
    const r = await tryCompleteJourney(PROFILE, JOURNEY)
    expect(r.completed).toBe(true)
    expect(zapGrants()).toHaveLength(1)
    expect(zapGrants()[0]).toMatchObject({ reward_kind: 'zaps', amount: 75 })
    expect(hoisted.awardZapsForAction).toHaveBeenCalledTimes(1)
    expect(hoisted.awardZapsForAction).toHaveBeenCalledWith(PROFILE, 'journey_finished')
  })

  it('does not double-pay on redelivery (the claim short-circuits the award)', async () => {
    await tryCompleteJourney(PROFILE, JOURNEY)
    hoisted.awardZapsForAction.mockClear()

    const again = await tryCompleteJourney(PROFILE, JOURNEY)
    expect(again.alreadyDone).toBe(true)
    expect(zapGrants()).toHaveLength(1) // still exactly one purse row
    expect(hoisted.awardZapsForAction).not.toHaveBeenCalled() // conflict short-circuits before the award
  })

  it('recovers a purse skipped by a crash after the completion row (the C5 fix)', async () => {
    // Simulate the original call: completion row landed, but it crashed before paying the purse.
    store.journey_completions.push({ id: 'jc-0', profile_id: PROFILE, journey_id: JOURNEY, season: 1 })
    expect(zapGrants()).toHaveLength(0)

    const r = await tryCompleteJourney(PROFILE, JOURNEY)
    expect(r.alreadyDone).toBe(true) // the completion already existed
    expect(zapGrants()).toHaveLength(1) // ...but the purse now lands
    expect(hoisted.awardZapsForAction).toHaveBeenCalledTimes(1)
  })

  it('releases the claim when the award fails, so a later call re-pays', async () => {
    hoisted.awardZapsForAction.mockResolvedValue({ awarded: false, amount: 0 }) // inactive config / transient error
    const first = await tryCompleteJourney(PROFILE, JOURNEY)
    expect(first.completed).toBe(true) // the completion still lands
    expect(zapGrants()).toHaveLength(0) // claim was released — not claimed-but-unpaid

    // A later trigger re-invokes with a healthy ledger: the purse is now claimed and paid.
    hoisted.awardZapsForAction.mockResolvedValue({ awarded: true, amount: 75 })
    const second = await tryCompleteJourney(PROFILE, JOURNEY)
    expect(second.alreadyDone).toBe(true)
    expect(zapGrants()).toHaveLength(1)
  })
})
