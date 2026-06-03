// Experiment registry (ADR-069 Phase 5). Declares every A/B test + holdout up front
// — the same governance pattern as the trait registry — so "fine-tuning the experience"
// is measurable, not guesswork. Assignment is DETERMINISTIC from a stable hash (see
// ./assign), so no storage is needed: the same unit always lands in the same variant.
//
// A `control` variant is the within-experiment holdout. Set `status: 'off'` to force
// everyone to control (ship the variant code dark, or wind an experiment down).

export type ExperimentStatus = 'active' | 'off'

export interface Variant {
  key: string
  /** Relative weight; weights are normalized, so [1,1] = 50/50, [9,1] = 90/10. */
  weight: number
}

export interface ExperimentDef {
  key: string
  description: string
  status: ExperimentStatus
  /** Must include a `control`. */
  variants: Variant[]
  owner: string
}

export const EXPERIMENTS: readonly ExperimentDef[] = [
  {
    key: 'onboarding_first_action',
    description: 'Which first action the onboarding tour pushes — join a circle vs adopt a practice.',
    status: 'off', // ships dark until we have variant code to test
    owner: 'growth',
    variants: [
      { key: 'control', weight: 1 }, // current: find a circle
      { key: 'practice_first', weight: 1 },
    ],
  },
] as const

const BY_KEY = new Map(EXPERIMENTS.map((e) => [e.key, e]))

export function getExperiment(key: string): ExperimentDef | undefined {
  return BY_KEY.get(key)
}
