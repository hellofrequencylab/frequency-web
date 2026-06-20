import { describe, it, expect, vi, beforeEach } from 'vitest'

// WEBSITE-CHANGES-PLAN §3 B.1 (today-only un-log) + B.2 (anti-cheat caps).
//
// These lock the un-log REVERSAL contract and the daily-cap anti-cheat against a single
// in-memory fake of the admin client. The fake is a chainable query builder over a tiny
// per-table store; it records every write so each assertion can prove the exact effect:
//   • the practice_logs row for (profile, practice, today) is deleted
//   • the engagement_events idempotency row is deleted (else re-logging silently no-ops)
//   • a compensating zap_transactions row debits EXACTLY the stored zaps_awarded
//   • the streak is re-derived (current_streak mirrored from the remaining logs)
//   • the per-day total-logs cap refuses a NEW practice past the ceiling, but never an
//     already-logged one, and never strands an engagement_events idempotency row.

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const store: Store = {
  practice_logs: [],
  engagement_events: [],
  zap_transactions: [],
  reward_grants: [],
  profiles: [],
}

const TODAY = new Date().toISOString().slice(0, 10)
const PROFILE = 'u1'
const PRACTICE = 'p1'

// A minimal chainable builder: collects .eq() filters, then resolves the terminal
// op (.delete / .update / .insert / .maybeSingle / .select-await) against the store.
// Unknown tables (zap_config, practices, journey_plan_items, …) default to empty so a
// best-effort read in logPractice never throws — only the tables we assert on are seeded.
function from(table: string) {
  if (!store[table]) store[table] = []
  const filters: Array<[string, unknown]> = []
  let updatePayload: Row | null = null
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let insertPayload: Row | Row[] | null = null

  const match = (r: Row) => filters.every(([c, v]) => r[c] === v)

  const run = () => {
    if (op === 'delete') {
      const kept = store[table].filter((r) => !match(r))
      const removed = store[table].length - kept.length
      store[table] = kept
      return { data: null, error: null, _removed: removed }
    }
    if (op === 'update') {
      for (const r of store[table]) if (match(r)) Object.assign(r, updatePayload)
      return { data: null, error: null }
    }
    if (op === 'insert') {
      const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload!]
      for (const r of rows) store[table].push({ ...r })
      return { data: rows.map((r, i) => ({ id: `${table}-${i}`, ...r })), error: null }
    }
    return { data: store[table].filter(match), error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (payload: Row | Row[]) => {
      op = 'insert'
      insertPayload = payload
      return api
    },
    // Upsert with ignoreDuplicates: insert the row unless one already matches its
    // identity columns (mirrors the practice_logs unique (profile, practice, day)).
    upsert: (payload: Row, opts?: { onConflict?: string }) => {
      const keys = (opts?.onConflict ?? '').split(',').map((k) => k.trim()).filter(Boolean)
      const dup =
        keys.length > 0 &&
        store[table].some((r) => keys.every((k) => r[k] === payload[k]))
      if (!dup) store[table].push({ ...payload })
      return { ...api, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) }
    },
    update: (payload: Row) => {
      op = 'update'
      updatePayload = payload
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    eq: (c: string, v: unknown) => {
      filters.push([c, v])
      return api
    },
    gte: () => api,
    lt: () => api,
    order: () => api,
    limit: () => api,
    like: () => api,
    async maybeSingle() {
      return { data: run().data?.[0] ?? null, error: null }
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t) }),
}))

// Keep the heavy, best-effort side effects out of the unit under test.
vi.mock('@/lib/engagement/events', () => ({
  recordEngagementEvent: async (input: { idempotencyKey: string; actorProfileId: string }) => {
    const dup = store.engagement_events.some((r) => r.idempotency_key === input.idempotencyKey)
    if (dup) return { recorded: false }
    store.engagement_events.push({
      idempotency_key: input.idempotencyKey,
      actor_profile_id: input.actorProfileId,
    })
    return { recorded: true }
  },
}))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('@/lib/achievements', () => ({
  recordStreakActivity: async () => {},
  processGamificationEvent: async () => {},
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))
vi.mock('@/lib/core/roles', () => ({ ROLE_HIERARCHY: ['member', 'crew', 'host'] }))
vi.mock('@/lib/rewards/spark', () => ({ maybeSpark: async () => ({ sparked: false, amount: 0 }) }))
// Best-effort, dynamically-imported side effects: stub so they never touch the store.
vi.mock('@/lib/rewards/creation', () => ({
  awardValidatedCreation: async () => {},
  awardCreationToken: async () => {},
}))
vi.mock('@/lib/quest/complete', () => ({ tryCompleteJourney: async () => {} }))

// The streak recompute is exercised through the real module so the test proves the
// derived count is written; its admin client is the same fake.
import { logPractice, unlogPractice, MAX_PRACTICE_LOGS_PER_DAY } from './practices'

function reset() {
  for (const k of Object.keys(store)) store[k] = []
  store.profiles = [{ id: PROFILE, meta: {}, current_streak: 0, longest_streak: 0 }]
}

beforeEach(reset)

// --- B.1 un-log reversal ---------------------------------------------------

describe('unlogPractice — today-only reversal', () => {
  function seedLog(zaps: number) {
    store.practice_logs.push({
      id: 'log-1',
      profile_id: PROFILE,
      practice_id: PRACTICE,
      logged_for: TODAY,
      zaps_awarded: zaps,
    })
    store.engagement_events.push({
      idempotency_key: `practice_log:${PROFILE}:${PRACTICE}:${TODAY}`,
      actor_profile_id: PROFILE,
    })
  }

  it('deletes the log row and the idempotency row (so re-logging is not blocked)', async () => {
    seedLog(12)
    const res = await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(res.unlogged).toBe(true)
    expect(store.practice_logs.find((r) => r.practice_id === PRACTICE)).toBeUndefined()
    expect(
      store.engagement_events.find(
        (r) => r.idempotency_key === `practice_log:${PROFILE}:${PRACTICE}:${TODAY}`,
      ),
    ).toBeUndefined()
  })

  it('debits EXACTLY the Zaps stored on the log row', async () => {
    seedLog(15)
    const res = await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    const debit = store.zap_transactions.find((r) => r.action_type === 'practice_log_reversed')
    expect(debit?.amount).toBe(-15) // exact compensating debit
    expect(res.zapsReversed).toBe(15) // reported as a magnitude
  })

  it('debits nothing when the practice awarded no Zaps (zaps_awarded 0 / null)', async () => {
    seedLog(0)
    const res = await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(store.zap_transactions).toHaveLength(0)
    expect(res.zapsReversed).toBe(0)
  })

  it('is idempotent: a second un-log finds no row and touches nothing', async () => {
    seedLog(12)
    await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    const before = store.zap_transactions.length
    const res = await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(res.unlogged).toBe(false)
    expect(store.zap_transactions.length).toBe(before) // no double-debit
  })

  it('re-derives the streak from the remaining logs (today removed)', async () => {
    // Logged today + yesterday → streak 2. Un-logging today should leave current_streak
    // reflecting only yesterday (the deriver is alive-yesterday → 1).
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    store.practice_logs.push({ profile_id: PROFILE, practice_id: 'p0', logged_for: yesterday, zaps_awarded: 12 })
    seedLog(12)
    await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    const prof = store.profiles.find((p) => p.id === PROFILE)
    expect(prof?.current_streak).toBe(1) // yesterday survives; today is gone
  })

  it('reverses a Welcome Back Zap grant this log created', async () => {
    seedLog(12)
    store.reward_grants.push({
      profile_id: PROFILE,
      rule_key: `welcome.back:${TODAY}`,
      reward_kind: 'zaps',
    })
    await unlogPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(
      store.reward_grants.find((r) => r.rule_key === `welcome.back:${TODAY}`),
    ).toBeUndefined()
    expect(
      store.zap_transactions.find((r) => r.action_type === 'welcome_back_reversed')?.amount,
    ).toBe(-10) // ZAP_AMOUNTS.welcome_back
  })
})

// --- B.2 anti-cheat: per-day total-logs cap --------------------------------

describe('logPractice — per-day total-logs cap (D5)', () => {
  it('refuses a NEW distinct practice once the daily cap is reached', async () => {
    for (let i = 0; i < MAX_PRACTICE_LOGS_PER_DAY; i++) {
      store.practice_logs.push({
        profile_id: PROFILE,
        practice_id: `cap-${i}`,
        logged_for: TODAY,
      })
    }
    const before = store.engagement_events.length
    const res = await logPractice({ profileId: PROFILE, practiceId: 'one-too-many' })
    expect(res.logged).toBe(false)
    expect(res.cappedDaily).toBe(true)
    // The refusal must NOT strand an idempotency row (that would block a later real log).
    expect(store.engagement_events.length).toBe(before)
  })

  it('still logs a practice ALREADY logged today even at the cap (idempotent no-op, not capped)', async () => {
    for (let i = 0; i < MAX_PRACTICE_LOGS_PER_DAY; i++) {
      store.practice_logs.push({
        profile_id: PROFILE,
        practice_id: `cap-${i}`,
        logged_for: TODAY,
      })
    }
    // 'cap-0' is already in today's set → the cap must not bite it; it returns the
    // idempotent already-logged no-op (recorded=false), never cappedDaily.
    store.engagement_events.push({
      idempotency_key: `practice_log:${PROFILE}:cap-0:${TODAY}`,
      actor_profile_id: PROFILE,
    })
    const res = await logPractice({ profileId: PROFILE, practiceId: 'cap-0' })
    expect(res.cappedDaily).toBeUndefined()
    expect(res.logged).toBe(false) // duplicate idempotency key → idempotent no-op
  })

  it('allows a new practice while under the cap', async () => {
    store.practice_logs.push({ profile_id: PROFILE, practice_id: 'cap-0', logged_for: TODAY })
    const res = await logPractice({ profileId: PROFILE, practiceId: 'fresh' })
    expect(res.cappedDaily).toBeUndefined()
    expect(res.logged).toBe(true)
  })
})
