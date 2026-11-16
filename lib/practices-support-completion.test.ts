import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROFILE = '10000000-0000-4000-8000-000000000001'
const PRACTICE = '10000000-0000-4000-8000-000000000002'
const BODY = '20000000-0000-4000-8000-000000000001'
const MIND = '20000000-0000-4000-8000-000000000002'
const BODY_PLAN = '30000000-0000-4000-8000-000000000001'
const MIND_PLAN = '30000000-0000-4000-8000-000000000002'
const DAY = '2026-11-14'
type Row = Record<string, unknown>
const io = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, keys: new Set<string>(), complete: vi.fn(), warn: vi.fn(), award: vi.fn(), awardAction: vi.fn(), failPolicies: false, throwLegacy: false, resolvedDay: '2026-11-14' }))

function from(table: string) {
  const predicates: ((row: Row) => boolean)[] = []
  let mode: 'read' | 'update' | 'upsert' = 'read'
  let payload: Row = {}
  let maximum = Infinity
  let ascending = true
  let orderBy = ''
  const filtered = () => (io.tables[table] ?? []).filter((row) => predicates.every((predicate) => predicate(row)))
  function run() {
    if (table === 'journey_enrollments' && io.failPolicies) return { data: null, error: { message: 'private provider payload' } }
    if (mode === 'update') { for (const row of filtered()) Object.assign(row, payload); return { data: filtered(), error: null } }
    if (mode === 'upsert') {
      const rows = io.tables[table] ??= []
      if (!rows.some((row) => row.profile_id === payload.profile_id && row.practice_id === payload.practice_id && row.logged_for === payload.logged_for)) {
        rows.push({ id: 'new-log', ...payload })
      }
      return { data: null, error: null }
    }
    const rows = [...filtered()]
    if (orderBy) rows.sort((a, b) => String(a[orderBy]).localeCompare(String(b[orderBy])) * (ascending ? 1 : -1))
    return { data: rows.slice(0, maximum), error: null }
  }
  const query = {
    select(columns: string) {
      if (io.throwLegacy && table === 'practices' && columns === 'domain_id') throw new Error('legacy lookup failed')
      return query
    },
    eq(field: string, value: unknown) { predicates.push((row) => row[field] === value); return query },
    not(field: string, _operator: string, value: unknown) { predicates.push((row) => (row[field] ?? null) !== value); return query },
    gt(field: string, value: string) { predicates.push((row) => String(row[field]) > value); return query },
    gte(field: string, value: string) { predicates.push((row) => String(row[field]) >= value); return query },
    lt(field: string, value: string) { predicates.push((row) => String(row[field]) < value); return query },
    order(field: string, opts: { ascending: boolean }) { orderBy = field; ascending = opts.ascending; return query },
    limit(value: number) { maximum = value; return query },
    update(value: Row) { payload = value; mode = 'update'; return query },
    upsert(value: Row) { payload = value; mode = 'upsert'; return query },
    maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null } },
    then<T>(resolve: (value: ReturnType<typeof run>) => T) { return Promise.resolve(run()).then(resolve) },
  }
  return query
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: async (_profileId: string, _zone: unknown, at?: Date) => at ? at.toISOString().slice(0, 10) : io.resolvedDay, memberDay: () => io.resolvedDay }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async ({ idempotencyKey }: { idempotencyKey: string }) => {
  if (io.keys.has(idempotencyKey)) return { recorded: false }
  io.keys.add(idempotencyKey); return { recorded: true }
} }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('@/lib/achievements', () => ({ recordStreakActivity: async () => {}, processGamificationEvent: async () => {} }))
vi.mock('@/lib/practice-streak', () => ({ recordPracticeStreak: async () => {}, recomputePracticeStreakAfterUnlog: async () => {} }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root' }))
vi.mock('@/lib/rewards/spark', () => ({ maybeSpark: async () => ({ sparked: false, amount: 0 }) }))
vi.mock('@/lib/rewards/creation', () => ({ awardValidatedCreation: async () => {}, awardCreationToken: async () => {} }))
vi.mock('@/lib/zaps', () => ({ awardZaps: io.award, awardZapsForAction: io.awardAction, reverseZaps: async () => {}, practiceLogAction: () => 'practice_logged_standard' }))
vi.mock('@/lib/quest/complete', () => ({ tryCompleteJourney: io.complete }))
vi.mock('@/lib/log', () => ({ log: { warn: io.warn, error: vi.fn() } }))
import { logPractice } from './practices'

const policy = { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
  windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }
const enrollment = (id: string, planId = MIND_PLAN, over: Row = {}): Row => ({ id, profile_id: PROFILE, plan_id: planId, completion_policy: policy, completed_at: null, ...over })
beforeEach(() => {
  vi.clearAllMocks(); io.keys.clear(); io.failPolicies = false; io.throwLegacy = false; io.resolvedDay = DAY
  io.complete.mockResolvedValue({ completed: false })
  io.award.mockResolvedValue({ amount: 12 }); io.awardAction.mockResolvedValue({ amount: 12 })
  io.tables = {
    practices: [{ id: PRACTICE, uses_timer: false, domain_id: BODY, secondary_domain_id: MIND, primary_pct: 75, weight_class: 'standard', created_by: null }],
    practice_logs: Array.from({ length: 13 }, (_, index) => ({ id: `old-${index}`, profile_id: PROFILE,
      practice_id: PRACTICE, logged_for: `2026-11-${String(index + 1).padStart(2, '0')}`, completed: true, pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 75 })),
    journey_plan_items: [{ plan_id: BODY_PLAN, domain_id: BODY, 'plan.ranked_eligible': true }],
    journey_enrollments: [enrollment('a')],
  }
})

describe('actual practice logging triggers recorded-support Journey checks', () => {
  it('routes a 14th Body-primary/Mind-supported day to the SAME evaluator for the enrolled Mind Journey', async () => {
    const result = await logPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(result).toMatchObject({ logged: true, zapsAwarded: 12 })
    expect(new Set(io.tables.practice_logs.map((row) => row.logged_for)).size).toBe(14)
    expect(io.complete.mock.calls).toEqual([[PROFILE, BODY_PLAN], [PROFILE, MIND_PLAN]])
    expect(io.warn).not.toHaveBeenCalled()
  })
  it('keeps the legacy fan-out for unenrolled/NULL-policy members without broadening qualification', async () => {
    io.tables.journey_enrollments = [enrollment('a', MIND_PLAN, { completion_policy: null })]
    await logPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(io.complete.mock.calls).toEqual([[PROFILE, BODY_PLAN]])
  })
  it('deduplicates the same plan across legacy results and repeated completed/active V2 enrollments', async () => {
    io.tables.journey_plan_items = [{ plan_id: MIND_PLAN, domain_id: BODY, 'plan.ranked_eligible': true }, { plan_id: MIND_PLAN, domain_id: BODY, 'plan.ranked_eligible': true }]
    io.tables.journey_enrollments = [enrollment('a', MIND_PLAN, { completed_at: '2026-11-12' }), enrollment('b')]
    await logPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(io.complete.mock.calls).toEqual([[PROFILE, MIND_PLAN]])
  })
  it('retains log idempotency on a retry instead of paying or checking the same new log twice', async () => {
    await logPractice({ profileId: PROFILE, practiceId: PRACTICE })
    const completedCalls = io.complete.mock.calls.length
    const paidCalls = io.awardAction.mock.calls.length
    expect(await logPractice({ profileId: PROFILE, practiceId: PRACTICE })).toEqual({ logged: false, zapsAwarded: 0 })
    expect(io.complete).toHaveBeenCalledTimes(completedCalls)
    expect(io.awardAction).toHaveBeenCalledTimes(paidCalls)
    expect(io.tables.practice_logs).toHaveLength(14)
  })
  it('does not let unavailable policy evidence break the durable log or suppress legacy checks', async () => {
    io.failPolicies = true
    const result = await logPractice({ profileId: PROFILE, practiceId: PRACTICE })
    expect(result).toMatchObject({ logged: true, zapsAwarded: 12 })
    expect(io.tables.practice_logs).toHaveLength(14)
    expect(io.complete.mock.calls).toEqual([[PROFILE, BODY_PLAN]])
    expect(io.warn.mock.calls).toEqual([['practice.recorded_support_completion_unavailable', { reason: 'read_failed' }]])
    expect(JSON.stringify(io.warn.mock.calls)).not.toMatch(new RegExp(`${PROFILE}|${MIND_PLAN}|${DAY}|private provider payload`))
  })
  it('still tries V2 contracts when the independent legacy current-primary lookup throws', async () => {
    io.throwLegacy = true
    expect(await logPractice({ profileId: PROFILE, practiceId: PRACTICE })).toMatchObject({ logged: true })
    expect(io.complete.mock.calls).toEqual([[PROFILE, MIND_PLAN]])
  })
  it('uses the server-resolved overnight log day rather than the finalize day for policy matching', async () => {
    io.resolvedDay = '2026-11-15'
    io.tables.journey_enrollments = [enrollment('a', MIND_PLAN, { completion_policy: { ...policy, windowEnd: '2026-11-14' } })]
    io.tables.practices[0].uses_timer = true
    await logPractice({ profileId: PROFILE, practiceId: PRACTICE, secondsDone: 300, secondsTarget: 300, startedAt: '2026-11-14T23:59:00Z' })
    expect(io.tables.practice_logs.at(-1)?.logged_for).toBe('2026-11-14')
    expect(io.complete.mock.calls).toEqual([[PROFILE, BODY_PLAN], [PROFILE, MIND_PLAN]])
  })
})
