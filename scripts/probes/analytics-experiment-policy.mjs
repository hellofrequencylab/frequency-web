import assert from 'node:assert/strict'
import { EXPERIMENT_CATALOG, evaluateExperiment, isExperimentKey, outcomeInterval } from '../../lib/analytics/experiments.ts'

assert.equal(isExperimentKey('model-invented-variant'), false)
assert.equal(outcomeInterval(0, 0), null)
assert.equal(outcomeInterval(3, 2), null)
const arm = { excluded: 0, exposed: 100, eligible: 100, converted: 10, pending: 0 }
const result = { id: 'fixture', key: 'upcoming-next-step', status: 'completed', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-09T00:00:00Z', guardrailsReviewedAt: '2026-01-20T00:00:00Z', targetPerArm: 100, minimumDays: 7, conversionDays: 7, control: arm, treatment: { ...arm, converted: 80 } }
const now = Date.parse('2026-02-01T00:00:00Z')
assert.equal(evaluateExperiment(result, now).state, 'review-treatment')
assert.equal(evaluateExperiment({ ...result, status: 'running' }, now).state, 'waiting')
assert.equal(evaluateExperiment({ ...result, treatment: { ...arm, pending: 1 } }, now).state, 'waiting')
assert.equal(evaluateExperiment({ ...result, treatment: { ...arm, excluded: 1 } }, now).state, 'inconclusive')
assert.equal(evaluateExperiment({ ...result, treatment: { ...arm, eligible: 20, converted: 2 } }, now).state, 'inconclusive')
assert.equal(Object.keys(EXPERIMENT_CATALOG).length, 1)
console.log('Experiment policy passed: closed catalog, mature follow-up, attrition and review-only promotion.')
