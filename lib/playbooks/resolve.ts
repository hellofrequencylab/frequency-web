// The next-best-action playbook RESOLVER (Resonance Engine · ADR-382 · docs/NEXT-GEN-CRM.md
// Altitude 3 "Action: next-best-action playbook picker"). The single PURE function that turns a
// member's prediction scores into THE one playbook the person-detail picker offers, the same choice
// the Today ranker makes (lib/ai/vera/today.ts rankTodayCandidates), so the worklist, Today, and the
// Space contact detail all agree by construction.
//
// PURE: no IO, no Supabase/Next imports, so it is trivially unit-testable and importable from a Server
// Component or a test alike. The selection law mirrors the ranker:
//   • a real next move wins: a non-`none` next_best_action resolves to its playbook;
//   • otherwise the churn tier's playbook fires (so a high-churn member with no explicit move still
//     gets the in-product streak save);
//   • a `none` move at `low`/unknown churn resolves to NOTHING worth surfacing (a steady member needs
//     no card), so the picker shows nothing rather than a no-op "Steady" play.

import type { ChurnRisk, NextBestAction } from '@/lib/traits/compute'
import { playbookForChurnRisk, playbookForNextBestAction, type Playbook } from './registry'

/** The minimal score shape the resolver needs (a subset of MemberScores). The two strings are read
 *  loosely off the matview, so they may be null or an unknown value; the resolver normalizes both. */
export interface ResolveScoresInput {
  /** The churn band string ('low' | 'medium' | 'high'), or null/unknown. */
  churnRisk: string | null
  /** The next_best_action string ('reengage' | … | 'none'), or null/unknown. */
  nextBestAction: string | null
}

const CHURN_VALUES: readonly ChurnRisk[] = ['low', 'medium', 'high']
const NBA_VALUES: readonly NextBestAction[] = ['reengage', 'activate', 'join_circle', 'deepen', 'invite', 'none']

function asChurn(v: string | null): ChurnRisk | null {
  return v && (CHURN_VALUES as readonly string[]).includes(v) ? (v as ChurnRisk) : null
}
function asNba(v: string | null): NextBestAction | null {
  return v && (NBA_VALUES as readonly string[]).includes(v) ? (v as NextBestAction) : null
}

/**
 * The one playbook to offer for a member's scores, or null when there is nothing worth surfacing.
 * PURE + deterministic, the same selection the Today ranker makes:
 *   • a non-`none` next_best_action -> its bound playbook;
 *   • a `none` move with medium/high churn -> that churn tier's playbook (the streak save / check-in);
 *   • a `none` move with low/unknown churn -> null (a steady member: no card).
 * A playbook with NO actions (the registry's no-op `Steady` entries) also resolves to null, so the
 * picker only ever offers a playbook that can actually do something.
 */
export function resolvePlaybookForScores(scores: ResolveScoresInput): Playbook | null {
  const churn = asChurn(scores.churnRisk)
  const nba = asNba(scores.nextBestAction)

  // A real next move wins.
  if (nba && nba !== 'none') {
    const p = playbookForNextBestAction(nba)
    return p && p.actions.length > 0 ? p : null
  }

  // No explicit move: fall back to the churn tier, but only when there is real risk (medium/high).
  if (churn === 'medium' || churn === 'high') {
    const p = playbookForChurnRisk(churn)
    return p && p.actions.length > 0 ? p : null
  }

  // Steady (low / unknown churn, no move): nothing to surface.
  return null
}
