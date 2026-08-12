'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE PRE-PUBLISH QUALITY READ, as a server action (ADR-993).
//
// The ONE door a review step calls to ask "is this good enough yet?". It is the generalization
// of `submitJourneyForReview` (app/(main)/journeys/actions.ts), which was the only surface that
// could ask. Any entity's Spark review step can call this with its draft; the entity's standard
// (lib/ai/quality-gate.ts) decides how hard the bar is.
//
// THREE THINGS THIS DELIBERATELY DOES NOT DO:
//   1. It does not WRITE. It reads a draft the caller already has in hand and returns a verdict.
//      Persisting the verdict, and deciding what it means, stay with the entity's own action
//      (the Journey's rank eligibility is set in app/(main)/journeys/actions.ts, not here).
//   2. It does not gate publishing. A `rejected` verdict is advice; the author still decides.
//      Only an entity that has said what a verdict COSTS (rank, for a Journey) may act on it.
//   3. It does not run itself. Nothing calls this on a timer or on save. A person asks.
//
// AUTHZ: signed-in only. The draft is supplied by the caller and nothing is looked up, so this
// grants no access to anything; the gate is here so an unauthenticated request cannot burn spend.
// ─────────────────────────────────────────────────────────────────────────────

import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { studioManifest } from '@/lib/studio/registry'
import { qualityStandardFor, runQualityGate, type QualityVerdict } from './quality-gate'

/** Draft text is capped before it reaches the model, so one huge paste cannot blow a budget. */
const MAX_CHARS = 12_000

/**
 * Read one entity's draft against its standard and return the verdict + coaching.
 *
 * `content` is the draft rendered as plain text by the surface that holds it (the review board
 * already has every field as a label plus a value, which is exactly the right shape). Rendering
 * stays with the caller because only the caller knows what its entity is made of.
 *
 * FAIL-SAFE + FAIL-CLOSED: never throws, and every failure path returns a `pending` verdict,
 * which is NEVER a pass. Check `verdict.status === 'approved'`.
 */
export async function reviewEntityDraftAction(
  entity: string,
  content: string,
): Promise<ActionResult<{ verdict: QualityVerdict }>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  // The entity must be a real registered one, so a caller cannot invent a key and spend against
  // a cap nobody declared. The manifest's label is what the model is told it is reading.
  const manifest = studioManifest(entity)
  if (!manifest) return fail('We do not know how to review that.')

  const body = (content ?? '').trim().slice(0, MAX_CHARS)
  if (body.length < 20) return fail('There is not enough here to read yet. Fill it in first.')

  const verdict = await runQualityGate(qualityStandardFor(manifest.entity, manifest.label), body)
  return ok({ verdict })
}
