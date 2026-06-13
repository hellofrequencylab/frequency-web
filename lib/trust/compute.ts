// Pure trust-score computation (ADR-247). Given a profile's signals, derive the score
// projection: a `global` rollup (every signal) plus a per-context score. Deterministic and
// framework-free, so the projection is fully testable and the recompute is just "replay".
//
// Weight comes from the CURRENT catalog (weights.ts), not the stored snapshot, which is
// exactly what lets weights evolve without a data migration. A score is floored at 0 — trust
// doesn't go negative as a number; penalties pull it down toward the floor.

import { weightFor } from './weights'

export interface SignalForCompute {
  source: string
  signalType: string
  context: string
}

export interface ContextScore {
  context: string
  score: number
  signalCount: number
}

export interface ComputedScores {
  /** Every (profile, context) row to write — includes the 'global' rollup. */
  rows: ContextScore[]
  global: number
  byContext: Record<string, number>
}

/**
 * Replay a profile's signals into score rows. Each signal contributes its current weight
 * to its own context AND to the 'global' rollup. Scores are floored at 0.
 */
export function computeScores(signals: readonly SignalForCompute[]): ComputedScores {
  const sums = new Map<string, number>()
  const counts = new Map<string, number>()

  const add = (context: string, weight: number) => {
    sums.set(context, (sums.get(context) ?? 0) + weight)
    counts.set(context, (counts.get(context) ?? 0) + 1)
  }

  for (const s of signals) {
    const w = weightFor(s.source, s.signalType)
    add('global', w)
    if (s.context !== 'global') add(s.context, w)
  }

  const rows: ContextScore[] = [...sums.keys()].map((context) => ({
    context,
    score: Math.max(0, sums.get(context) ?? 0),
    signalCount: counts.get(context) ?? 0,
  }))

  const byContext: Record<string, number> = {}
  for (const r of rows) if (r.context !== 'global') byContext[r.context] = r.score

  return { rows, global: Math.max(0, sums.get('global') ?? 0), byContext }
}
