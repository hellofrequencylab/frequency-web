import { describe, expect, it } from 'vitest'
import type { PolicyReadClient } from './support-policy-read'
import { readEnrollmentPolicy, readRecordedSupportDays } from './support-policy-read'

const MIND = '10000000-0000-4000-8000-000000000001'
const policy = { version: 2 as const, daysRequired: 14 as const, expressionRequired: false as const,
  practiceEvidenceVersion: 1 as const, windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }
type Row = Record<string, unknown>
function clientFor(enrollments: Row[], logs: Row[] = [], failPage = -1, failPolicy = false, providerCap = Infinity, ignoreCursor = false) {
  const calls: Array<{ table: string; field: string; value: unknown }> = []
  let logPage = 0
  const client = { from(table: string) {
    const pageIndex = table === 'practice_logs' ? logPage++ : -1
    let rows = [...(table === 'journey_enrollments' ? enrollments : logs)]
    const sort: Array<[string, boolean]> = []
    let start = 0; let end = Infinity
    const query = {
      select: () => query,
      eq(field: string, value: unknown) { calls.push({ table, field, value }); rows = rows.filter((r) => r[field] === value); return query },
      is(field: string, value: unknown) { rows = rows.filter((r) => (r[field] ?? null) === value); return query },
      not(field: string, _op: string, value: unknown) { rows = rows.filter((r) => (r[field] ?? null) !== value); return query },
      gt(field: string, value: string) { if (!ignoreCursor) rows = rows.filter((r) => String(r[field]) > value); return query },
      gte(field: string, value: string) { rows = rows.filter((r) => String(r[field]) >= value); return query },
      lte(field: string, value: string) { rows = rows.filter((r) => String(r[field]) <= value); return query },
      order(field: string, options: { ascending: boolean }) { sort.push([field, options.ascending]); return query },
      range(a: number, b: number) { start = a; end = b; return query },
      limit(n: number) { end = Math.min(n, providerCap) - 1; return query },
      async maybeSingle() { const result = run(); return { ...result, data: (result.data as Row[] | null)?.[0] ?? null } },
      then<T>(resolve: (value: { data: Row[] | null; error: unknown }) => T) { return Promise.resolve(run()).then(resolve) },
    }
    function run() {
      if ((table === 'journey_enrollments' && failPolicy) || (table === 'practice_logs' && pageIndex === failPage)) return { data: null, error: { code: 'unavailable' } }
      rows.sort((a, b) => { for (const [field, asc] of sort) { const compare = String(a[field]).localeCompare(String(b[field])); if (compare) return asc ? compare : -compare } return 0 })
      return { data: rows.slice(start, end + 1), error: null }
    }
    return query
  } } as unknown as PolicyReadClient
  return { client, calls }
}
const enrollment = (id: string, started: string, snapshot: unknown, completed: string | null = null): Row => ({ id, profile_id: 'member', plan_id: 'journey', started_at: started, completed_at: completed, completion_policy: snapshot })

describe('enrollment policy selection', () => {
  it('keeps the oldest active legacy contract even if a new version exists', async () => {
    const { client, calls } = clientFor([enrollment('2', '2026-11-02', policy), enrollment('1', '2026-11-01', null)])
    expect(await readEnrollmentPolicy(client, 'member', 'journey')).toEqual({ available: true, policy: null })
    expect(calls).toContainEqual({ table: 'journey_enrollments', field: 'profile_id', value: 'member' })
    expect(calls).toContainEqual({ table: 'journey_enrollments', field: 'plan_id', value: 'journey' })
  })
  it('uses the ID as a deterministic tie-breaker, not database accident', async () => {
    const { client } = clientFor([enrollment('2', '2026-11-01', policy), enrollment('1', '2026-11-01', null)])
    expect(await readEnrollmentPolicy(client, 'member', 'journey')).toEqual({ available: true, policy: null })
  })
  it('uses the newest completed contract for reward recovery after finishing', async () => {
    const { client } = clientFor([enrollment('1', '2026-11-01', null, '2026-11-02'), enrollment('2', '2026-11-03', policy, '2026-11-04')])
    expect(await readEnrollmentPolicy(client, 'member', 'journey')).toEqual({ available: true, policy })
  })
  it('preserves unenrolled official behavior and legacy NULL enrollments', async () => {
    expect(await readEnrollmentPolicy(clientFor([]).client, 'member', 'journey')).toEqual({ available: true, policy: null })
  })
  it('does not turn an invalid contract or read failure into legacy permission', async () => {
    expect((await readEnrollmentPolicy(clientFor([enrollment('1', '2026-11-01', { ...policy, version: 4 })]).client, 'member', 'journey')).available).toBe(false)
    expect((await readEnrollmentPolicy(clientFor([], [], -1, true).client, 'member', 'journey')).available).toBe(false)
  })
})

describe('complete immutable support-day reads', () => {
  const log = (id: number, day = '2026-11-03'): Row => ({ id: String(id).padStart(5, '0'), profile_id: 'member', logged_for: day, support_evidence_version: 1, support_pillar_ids: [MIND] })
  it('pages before aggregating and rejects another member and future days', async () => {
    const logs = Array.from({ length: 1000 }, (_, id) => log(id))
    logs.push(log(1001, '2026-11-04'), log(1002, '2026-11-05'), { ...log(1003), profile_id: 'other' })
    const { client, calls } = clientFor([], logs)
    expect(await readRecordedSupportDays(client, 'member', policy, '2026-11-04')).toEqual({ available: true, distinctDays: 2, unknownLogs: 0 })
    expect(calls.filter((call) => call.table === 'practice_logs' && call.field === 'profile_id')).toHaveLength(3)
  })
  it('keeps reading short provider pages until an empty keyset page proves completion', async () => {
    const logs = [log(1, '2026-11-01'), log(2, '2026-11-02'), log(3, '2026-11-03')]
    const { client, calls } = clientFor([], logs, -1, false, 1)
    expect(await readRecordedSupportDays(client, 'member', policy, '2026-11-28')).toEqual({ available: true, distinctDays: 3, unknownLogs: 0 })
    expect(calls.filter((call) => call.table === 'practice_logs' && call.field === 'profile_id')).toHaveLength(4)
  })
  it('fails closed if a later page fails after potentially qualifying rows', async () => {
    const logs = Array.from({ length: 1000 }, (_, id) => log(id, `2026-11-${String(id % 28 + 1).padStart(2, '0')}`))
    expect(await readRecordedSupportDays(clientFor([], logs, 1).client, 'member', policy, '2026-11-28')).toEqual({ available: false, distinctDays: 0, unknownLogs: 0 })
  })
  it('rejects a repeated or nonmonotonic provider page instead of looping or double counting', async () => {
    const { client } = clientFor([], [log(1)], -1, false, 1, true)
    expect((await readRecordedSupportDays(client, 'member', policy, '2026-11-28')).available).toBe(false)
  })
  it('reports incomplete when its bounded page budget cannot prove the end', async () => {
    const { client, calls } = clientFor([], Array.from({ length: 101 }, (_, id) => log(id)), -1, false, 1)
    expect((await readRecordedSupportDays(client, 'member', policy, '2026-11-28')).available).toBe(false)
    expect(calls.filter((call) => call.table === 'practice_logs')).toHaveLength(100)
  })
  it('distinguishes a successful empty read from unavailable evidence', async () => {
    expect(await readRecordedSupportDays(clientFor([]).client, 'member', policy, '2026-11-28')).toEqual({ available: true, distinctDays: 0, unknownLogs: 0 })
    expect((await readRecordedSupportDays(clientFor([], [], 0).client, 'member', policy, '2026-11-28')).available).toBe(false)
  })
})
