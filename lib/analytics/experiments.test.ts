import { describe, expect, it } from 'vitest'
import { evaluateExperiment, outcomeInterval, type ExperimentResult } from './experiments'

const now = Date.parse('2026-11-30T00:00:00Z')
const base: ExperimentResult = {
  id: 'test', key: 'upcoming-next-step', status: 'completed',
  startedAt: '2026-11-01T00:00:00Z', finishedAt: '2026-11-08T00:00:00Z', guardrailsReviewedAt: '2026-11-08T00:00:00Z',
  targetPerArm: 100, minimumDays: 7, conversionDays: 7,
  control: { excluded: 0, exposed: 100, eligible: 100, converted: 10, pending: 0 },
  treatment: { excluded: 0, exposed: 100, eligible: 100, converted: 50, pending: 0 },
}
describe('experiment evaluation', () => {
  it('never announces a winner during enrollment, incomplete observation or unreviewed guardrails', () => {
    expect(evaluateExperiment({ ...base, status: 'running' }, now).state).toBe('waiting')
    expect(evaluateExperiment({ ...base, guardrailsReviewedAt: null }, now).state).toBe('waiting')
    expect(evaluateExperiment(base, Date.parse('2026-11-10T00:00:00Z')).state).toBe('waiting')
    expect(evaluateExperiment({ ...base, treatment: { ...base.treatment, pending: 1 } }, now).state).toBe('waiting')
  })
  it('requires both preselected sample targets even when apparent uplift is large', () => {
    expect(evaluateExperiment({ ...base, treatment: { excluded: 0, exposed: 10, eligible: 10, converted: 9, pending: 0 } }, now).state).toBe('inconclusive')
  })
  it('requires separated uncertainty intervals and proposes review rather than automatic rollout', () => {
    expect(evaluateExperiment(base, now).state).toBe('review-treatment')
    expect(evaluateExperiment({ ...base, treatment: { ...base.treatment, converted: 12 } }, now).state).toBe('inconclusive')
    expect(evaluateExperiment({ ...base, control: base.treatment, treatment: base.control }, now).state).toBe('keep-control')
  })
  it('does not promote a treatment after post-assignment attrition', () => {
    expect(evaluateExperiment({ ...base, control: { ...base.control, excluded: 1 } }, now).state).toBe('inconclusive')
  })
  it('distinguishes zero measured conversions from an unavailable denominator', () => {
    expect(outcomeInterval(0, 100)?.[1]).toBeGreaterThan(0)
    expect(outcomeInterval(0, 0)).toBeNull()
    expect(outcomeInterval(101, 100)).toBeNull()
  })
})
