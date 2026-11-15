// Closed, reviewed variants. Model output never becomes an executable variant.
export const EXPERIMENT_CATALOG = {
  'upcoming-next-step': {
    title: 'Upcoming gathering heading',
    hypothesis: 'A clearer invitation may help signed-in Members make their next RSVP.',
    primaryEvent: 'event.rsvp',
    control: 'Upcoming',
    treatment: 'Find your next gathering',
    targetPerArm: 100,
    minimumDays: 7,
    conversionDays: 7,
    guardrails: 'Review accessibility, page performance, RSVP failures, cancellations, consent withdrawals and follow-up coverage before finishing. This heading test changes neither permissions nor booking behavior.',
  },
} as const
export type ExperimentKey = keyof typeof EXPERIMENT_CATALOG
export type ExperimentVariant = 'control' | 'treatment'
export type ExperimentCommand = 'draft' | 'start' | 'pause' | 'finish'
export function isExperimentKey(key: string): key is ExperimentKey {
  return Object.hasOwn(EXPERIMENT_CATALOG, key)
}

interface ExperimentArm {
  excluded: number
  exposed: number
  eligible: number
  converted: number
  pending: number
}
export interface ExperimentResult {
  id: string
  key: ExperimentKey
  status: 'draft' | 'running' | 'paused' | 'completed'
  startedAt: string | null
  finishedAt: string | null
  guardrailsReviewedAt: string | null
  targetPerArm: number
  minimumDays: number
  conversionDays: number
  control: ExperimentArm
  treatment: ExperimentArm
}

/** Wilson 95% interval for a measured binary outcome. */
export function outcomeInterval(converted: number, eligible: number): [number, number] | null {
  if (!Number.isInteger(eligible) || eligible <= 0 || !Number.isInteger(converted) || converted < 0 || converted > eligible) return null
  const z = 1.95996398454
  const p = converted / eligible
  const denominator = 1 + z * z / eligible
  const centre = (p + z * z / (2 * eligible)) / denominator
  const margin = z * Math.sqrt(p * (1 - p) / eligible + z * z / (4 * eligible * eligible)) / denominator
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)]
}

export function evaluateExperiment(result: ExperimentResult, now = Date.now()): { state: 'waiting' | 'inconclusive' | 'review-treatment' | 'keep-control'; explanation: string } {
  if (result.status !== 'completed') return { state: 'waiting', explanation: 'The pilot is still open. No winner is declared while enrollment or observation is ongoing.' }
  if (!result.guardrailsReviewedAt) return { state: 'waiting', explanation: 'The guardrail review is not recorded.' }
  const start = result.startedAt ? Date.parse(result.startedAt) : NaN
  const finish = result.finishedAt ? Date.parse(result.finishedAt) : NaN
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish - start < result.minimumDays * 86_400_000 || now < finish + result.conversionDays * 86_400_000 || result.control.pending || result.treatment.pending) {
    return { state: 'waiting', explanation: 'Wait for the minimum enrollment period and complete conversion follow-up after enrollment closes.' }
  }
  if (result.control.eligible < result.targetPerArm || result.treatment.eligible < result.targetPerArm) return { state: 'inconclusive', explanation: 'The preselected sample target was not reached in both arms. This pilot cannot establish an improvement.' }
  if (result.control.excluded || result.treatment.excluded) return { state: 'inconclusive', explanation: 'Exposed memberships were removed after assignment (consent withdrawal, account deletion or retention). The anonymous exclusion counts remain, but follow-up completeness is affected; this pilot cannot establish a winner.' }
  const c = outcomeInterval(result.control.converted, result.control.eligible)
  const t = outcomeInterval(result.treatment.converted, result.treatment.eligible)
  if (!c || !t) return { state: 'inconclusive', explanation: 'A valid measured outcome is unavailable.' }
  // Conservative interval separation. No multiple-comparison or sequential-peeking claim.
  if (t[0] > c[1]) return { state: 'review-treatment', explanation: 'The completed pilot favors the treatment under conservative interval separation. Review the recorded guardrails and a deployment proposal before promotion.' }
  if (c[0] > t[1]) return { state: 'keep-control', explanation: 'The completed pilot favors the control. Keep the original heading.' }
  return { state: 'inconclusive', explanation: 'The intervals overlap. The pilot does not establish a difference; keep the control.' }
}
