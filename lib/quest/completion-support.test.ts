import { beforeEach, describe, expect, it, vi } from 'vitest'

const MIND = '10000000-0000-4000-8000-000000000001'
const policy = { version: 2 as const, daysRequired: 14 as const, expressionRequired: false as const,
  practiceEvidenceVersion: 1 as const, windowStart: '2026-11-01', windowEnd: '2026-11-28', pillarIds: [MIND] }
const io = vi.hoisted(() => ({
  policyRead: vi.fn(), evidence: vi.fn(), memberDay: vi.fn(),
  official: true, challenge: true, expressionDone: false, legacyDays: 14,
}))
vi.mock('@/lib/quest/support-policy-read', () => ({ readEnrollmentPolicy: io.policyRead, readRecordedSupportDays: io.evidence }))
vi.mock('@/lib/member-day', () => ({ resolveMemberDay: io.memberDay }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const q = { select: () => q, eq: () => q, not: () => q, in: () => q, gte: () => q, lte: () => q,
    order: () => q, limit: () => q,
    async maybeSingle() {
      if (table === 'journey_plans') return { data: { ranked_eligible: true, official: io.official, window_starts_at: '2026-10-01T00:00:00Z', window_ends_at: '2026-12-01T00:00:00Z' } }
      if (table === 'season_challenges') return { data: io.challenge ? { id: 'expression' } : null }
      if (table === 'challenge_progress') return { data: io.expressionDone ? { completed_at: '2026-11-01' } : null }
      return { data: null }
    },
    then<T>(resolve: (value: unknown) => T) {
      const data = table === 'journey_plan_items' ? [{ domain_id: MIND }] : table === 'practice_logs'
        ? Array.from({ length: io.legacyDays }, (_, index) => ({ logged_for: `2026-11-${String(index + 1).padStart(2, '0')}` })) : []
      return Promise.resolve({ data, error: null }).then(resolve)
    },
  }
  return q
} }) }))
import { evaluateJourneyCompletion, isJourneyFinished } from './completion'

beforeEach(() => {
  io.policyRead.mockReset().mockResolvedValue({ available: true, policy })
  io.evidence.mockReset().mockResolvedValue({ available: true, distinctDays: 14, unknownLogs: 0 })
  io.memberDay.mockReset().mockResolvedValue('2026-11-14')
  io.official = true; io.challenge = true; io.expressionDone = false; io.legacyDays = 14
})

describe('prospective official completion integration', () => {
  it('finishes only a recorded new contract on 14 days without Expression', async () => {
    const result = await evaluateJourneyCompletion('member', 'journey', 7)
    expect(result).toMatchObject({ policyVersion: 2, distinctDays: 14, expressionRequired: false, expressionDone: false, finished: true })
    expect(io.memberDay).toHaveBeenCalledWith('member')
    expect(io.evidence).toHaveBeenCalledWith(expect.anything(), 'member', policy, '2026-11-14')
  })
  it('keeps actual challenge existence separate from optional qualification', async () => {
    io.challenge = false
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ hasExpression: false, expressionRequired: false, finished: true })
  })
  it('does not finish under the same threshold', async () => {
    io.evidence.mockResolvedValue({ available: true, distinctDays: 13, unknownLogs: 0 })
    expect((await evaluateJourneyCompletion('member', 'journey', 7)).finished).toBe(false)
  })
  it('retains the actual enrolled policy if the official flag later changes', async () => {
    io.official = false
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ policyVersion: 2, expressionRequired: false, finished: true })
  })
  it('uses the enrolled window instead of a subsequently edited plan window', async () => {
    const result = await evaluateJourneyCompletion('member', 'journey', 7)
    expect(result.windowStartsAt).toBe('2026-11-01')
    expect(result.windowEndsAt).toBe('2026-11-28')
  })
  it('preserves old official and no-enrollment Expression requirements', async () => {
    io.policyRead.mockResolvedValue({ available: true, policy: null })
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ expressionRequired: true, finished: false })
    io.expressionDone = true
    expect((await evaluateJourneyCompletion('member', 'journey', 7)).finished).toBe(true)
  })
  it('leaves library policy separate from prospective official contracts', async () => {
    io.official = false; io.challenge = false
    io.policyRead.mockResolvedValue({ available: true, policy: null })
    expect((await evaluateJourneyCompletion('member', 'journey', 7)).finished).toBe(true)
    expect(io.evidence).not.toHaveBeenCalled()
  })
  it('does not reinterpret unavailable policy or incomplete logs as permission', async () => {
    io.policyRead.mockResolvedValue({ available: false, policy: null })
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ finished: false, evidenceAvailable: false, windowOk: false })
    io.policyRead.mockResolvedValue({ available: true, policy })
    io.evidence.mockResolvedValue({ available: false, distinctDays: 0, unknownLogs: 0 })
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ policyVersion: 2, finished: false, evidenceAvailable: false })
  })
  it('treats unknown support as a lower bound without rejecting 14 known days', async () => {
    io.evidence.mockResolvedValue({ available: true, distinctDays: 13, unknownLogs: 2 })
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ finished: false, distinctDays: 13, unknownSupportLogs: 2 })
    io.evidence.mockResolvedValue({ available: true, distinctDays: 14, unknownLogs: 2 })
    expect(await evaluateJourneyCompletion('member', 'journey', 7)).toMatchObject({ finished: true, unknownSupportLogs: 2 })
  })
  it('retains all three-argument rules and rejects forged new policies', () => {
    expect(isJourneyFinished(14, true, false)).toBe(false)
    expect(isJourneyFinished(14, true, true)).toBe(true)
    expect(isJourneyFinished(14, false, false)).toBe(true)
    expect(isJourneyFinished(14, true, false, { ...policy, daysRequired: 1 } as unknown as typeof policy)).toBe(false)
  })
})
