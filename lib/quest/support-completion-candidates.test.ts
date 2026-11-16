import { describe, expect, it } from 'vitest'
import type { PolicyReadClient } from './support-policy-read'
import { readRecordedCompletionPlanIds } from './support-completion-candidates'

const MIND = '11111111-1111-4111-8111-111111111111'
const PLAN = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const policy = { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
  windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }
type Row = Record<string, unknown>
const enrollment = (id: string, over: Row = {}): Row => ({ id, profile_id: 'owner', plan_id: PLAN, completion_policy: policy, completed_at: null, ...over })
function fixture(rows: Row[], options: { cap?: number; failPage?: number; repeat?: boolean } = {}) {
  const calls: { fields: [string, unknown][]; cursor: string | null; selected: string }[] = []
  const client = { from(table: string) {
    expect(table).toBe('journey_enrollments')
    const call = { fields: [] as [string, unknown][], cursor: null as string | null, selected: '' }; calls.push(call)
    let maximum = Infinity
    const query = {
      select(value: string) { call.selected = value; return query },
      eq(field: string, value: unknown) { call.fields.push([field, value]); return query },
      not(field: string, op: string, value: unknown) { expect([field, op, value]).toEqual(['completion_policy', 'is', null]); return query },
      order(field: string, opts: { ascending: boolean }) { expect([field, opts.ascending]).toEqual(['id', true]); return query },
      limit(value: number) { maximum = Math.min(value, options.cap ?? Infinity); return query },
      gt(field: string, value: string) { expect(field).toBe('id'); call.cursor = value; return query },
      then<T>(resolve: (value: { data: Row[] | null; error: unknown }) => T) {
        const result = calls.length - 1 === options.failPage ? { data: null, error: { message: 'private provider detail' } }
          : { data: rows.filter((row) => call.fields.every(([field, value]) => row[field] === value) && row.completion_policy != null &&
            (options.repeat || call.cursor === null || String(row.id) > call.cursor))
            .sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(0, maximum), error: null }
        return Promise.resolve(result).then(resolve)
      },
    }
    return query
  } } as unknown as PolicyReadClient
  return { client, calls }
}

describe('recorded prospective completion candidates', () => {
  it('finds only this member’s exact V2 policies containing the actual logged day', async () => {
    const { client, calls } = fixture([
      enrollment('a'), enrollment('b', { plan_id: OTHER, profile_id: 'other' }),
      enrollment('c', { plan_id: OTHER, completion_policy: null }),
      enrollment('d', { plan_id: OTHER, completion_policy: { ...policy, version: 99 } }),
      enrollment('e', { plan_id: OTHER, completion_policy: { ...policy, windowStart: '2026-12-01', windowEnd: '2026-12-28' } }),
    ])
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14')).toEqual({ available: true, planIds: [PLAN] })
    expect(calls.every((call) => call.fields.some(([field, value]) => field === 'profile_id' && value === 'owner'))).toBe(true)
    expect(calls[0].selected).not.toMatch(/practices|domain_id|focus_details|logged_for/)
  })
  it('keeps completed enrollments for purse recovery and deduplicates plans across enrollments', async () => {
    const { client } = fixture([enrollment('a', { completed_at: '2026-11-12' }), enrollment('b'), enrollment('c', { plan_id: OTHER })])
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14')).toEqual({ available: true, planIds: [PLAN, OTHER] })
  })
  it('uses inclusive policy boundaries and the supplied practice day, not the server clock', async () => {
    for (const day of [policy.windowStart, policy.windowEnd]) {
      expect((await readRecordedCompletionPlanIds(fixture([enrollment('a')]).client, 'owner', day)).planIds).toEqual([PLAN])
    }
    expect((await readRecordedCompletionPlanIds(fixture([enrollment('a')]).client, 'owner', '2026-10-31')).planIds).toEqual([])
    expect((await readRecordedCompletionPlanIds(fixture([enrollment('a')]).client, 'owner', '2026-11-29')).planIds).toEqual([])
  })
  it('reads short provider pages to an empty keyset page and scopes each one', async () => {
    const { client, calls } = fixture([enrollment('a'), enrollment('b', { plan_id: OTHER }), enrollment('c')], { cap: 1 })
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14')).toEqual({ available: true, planIds: [PLAN, OTHER] })
    expect(calls.map((call) => call.cursor)).toEqual([null, 'a', 'b', 'c'])
    expect(calls.every((call) => call.fields[0]?.[1] === 'owner')).toBe(true)
  })
  it('returns no partial candidates on an initial or later-page read failure', async () => {
    for (const failPage of [0, 1]) {
      expect(await readRecordedCompletionPlanIds(fixture([enrollment('a'), enrollment('b')], { cap: 1, failPage }).client, 'owner', '2026-11-14'))
        .toEqual({ available: false, planIds: [], reason: 'read_failed' })
    }
  })
  it('rejects repeated/nonadvancing pages without double-counting or looping', async () => {
    const { client, calls } = fixture([enrollment('a')], { repeat: true, cap: 1 })
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14')).toEqual({ available: false, planIds: [], reason: 'invalid_page' })
    expect(calls).toHaveLength(2)
  })
  it('does not treat the bounded page budget as a complete candidate read', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => enrollment(String(index).padStart(3, '0')))
    const { client, calls } = fixture(rows, { cap: 1 })
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-11-14')).toEqual({ available: false, planIds: [], reason: 'page_limit' })
    expect(calls).toHaveLength(100)
  })
  it('distinguishes a successful empty read from an unavailable or malformed V2 contract', async () => {
    expect(await readRecordedCompletionPlanIds(fixture([]).client, 'owner', '2026-11-14')).toEqual({ available: true, planIds: [] })
    expect(await readRecordedCompletionPlanIds(fixture([enrollment('a', { completion_policy: { ...policy, daysRequired: 1 } })]).client, 'owner', '2026-11-14'))
      .toEqual({ available: false, planIds: [], reason: 'invalid_policy' })
  })
  it('rejects an invalid day before any privileged query', async () => {
    const { client, calls } = fixture([])
    expect(await readRecordedCompletionPlanIds(client, 'owner', '2026-02-31')).toEqual({ available: false, planIds: [], reason: 'invalid_day' })
    expect(calls).toHaveLength(0)
  })
})
