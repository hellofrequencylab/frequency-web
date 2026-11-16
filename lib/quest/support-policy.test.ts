import { describe, expect, it } from 'vitest'
import { countRecordedSupportDays, isPolicyDay, parseCompletionPolicy, recordedSupportIds } from './support-policy'

const MIND = '10000000-0000-4000-8000-000000000001'
const BODY = '10000000-0000-4000-8000-000000000002'
const SPIRIT = '10000000-0000-4000-8000-000000000003'
const policy = { version: 2 as const, daysRequired: 14 as const, expressionRequired: false as const,
  practiceEvidenceVersion: 1 as const, windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }

describe('immutable prospective completion policy', () => {
  it('accepts the exact prospective contract and copies its IDs', () => {
    const value = parseCompletionPolicy(policy)
    expect(value).toEqual(policy)
    expect(value?.pillarIds).not.toBe(policy.pillarIds)
  })
  it.each([null, [], {}, { ...policy, version: 3 }, { ...policy, daysRequired: 1 },
    { ...policy, expressionRequired: true }, { ...policy, practiceEvidenceVersion: 2 },
    { ...policy, windowStart: '2026-02-30' }, { ...policy, windowStart: '2026-12-01' },
    { ...policy, pillarIds: [] }, { ...policy, pillarIds: [MIND, MIND] },
    { ...policy, pillarIds: ['__proto__'] }])('refuses unknown, weakened or malformed contract %j', (raw) => {
    expect(parseCompletionPolicy(raw)).toBeNull()
  })
  it('handles real dates without treating a date-only key as a timezone instant', () => {
    expect(isPolicyDay('2028-02-29')).toBe(true)
    expect(isPolicyDay('2026-02-29')).toBe(false)
    expect(isPolicyDay('2026-11-01T00:00:00Z')).toBe(false)
  })
})

describe('recorded supports and distinct-day qualification', () => {
  it('uses the full insert-time snapshot before any primary/secondary fields', () => {
    expect(recordedSupportIds({ support_evidence_version: 1, support_pillar_ids: [MIND, BODY, SPIRIT], pillar_id: BODY })).toEqual([MIND, BODY, SPIRIT])
    expect(recordedSupportIds({ support_evidence_version: 1, support_pillar_ids: [], pillar_id: MIND })).toEqual([])
  })
  it('never upgrades malformed or future snapshots through another fallback', () => {
    expect(recordedSupportIds({ support_evidence_version: 2, support_pillar_ids: [MIND], pillar_id: BODY })).toBeNull()
    expect(recordedSupportIds({ support_evidence_version: 1, support_pillar_ids: ['junk'], pillar_id: BODY })).toBeNull()
    expect(recordedSupportIds({ support_evidence_version: null, support_pillar_ids: [MIND], pillar_id: BODY })).toBeNull()
  })
  it('uses older frozen positive-secondary shares without inventing other focuses', () => {
    expect(recordedSupportIds({ pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 75 })).toEqual([BODY, MIND])
    expect(recordedSupportIds({ pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 100 })).toEqual([BODY])
    expect(recordedSupportIds({ pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: null })).toEqual([BODY])
    expect(recordedSupportIds({ pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: 49 })).toEqual([BODY])
  })
  it('keeps known primary credit while marking an absent secondary share unknown', () => {
    const logs = [{ logged_for: '2026-11-03', pillar_id: BODY, secondary_pillar_id: MIND, primary_pct: null }]
    expect(countRecordedSupportDays(logs, policy, '2026-11-28')).toEqual({ distinctDays: 0, unknownLogs: 1 })
    expect(countRecordedSupportDays(logs, { ...policy, pillarIds: [BODY] }, '2026-11-28')).toEqual({ distinctDays: 1, unknownLogs: 1 })
  })
  it('cannot infer historical third/fourth supports from current practice data', () => {
    expect(recordedSupportIds({})).toBeNull()
    const logs = [{ logged_for: '2026-11-03', practice: { domain_id: MIND, focus_details: { [MIND]: {} } } }]
    expect(countRecordedSupportDays(logs, policy, '2026-11-28')).toEqual({ distinctDays: 0, unknownLogs: 1 })
  })
  it('counts repeated same-day and mixed-support logs as one Journey day', () => {
    const logs = [MIND, BODY, SPIRIT].map((id) => ({ logged_for: '2026-11-03', support_evidence_version: 1, support_pillar_ids: [MIND, id] }))
    expect(countRecordedSupportDays(logs, policy, '2026-11-28')).toEqual({ distinctDays: 1, unknownLogs: 0 })
  })
  it('uses inclusive enrolled bounds and excludes future/invalid dates', () => {
    const logs = ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-28', '2026-11-29', '2026-02-30']
      .map((day) => ({ logged_for: day, support_evidence_version: 1, support_pillar_ids: [MIND] }))
    expect(countRecordedSupportDays(logs, policy, '2026-11-02').distinctDays).toBe(2)
    expect(countRecordedSupportDays(logs, policy, '2026-11-28').distinctDays).toBe(3)
  })
  it('returns no invented days if the server member-day could not be resolved', () => {
    expect(countRecordedSupportDays([{ logged_for: '2026-11-03', pillar_id: MIND }], policy, 'unknown')).toEqual({ distinctDays: 0, unknownLogs: 1 })
  })
})
