// ============================================================================
// BETA GRADUATION (P4 SCAFFOLD) — the one-way switch from "free beta" to "billing
// live for the public".
// ============================================================================
//
// graduateBeta() flips the master `billing_live` platform flag ON (via setPlatformFlag, which writes the
// authoritative flag AND an audit event) and records the graduation on the beta approval trail. It does
// NOT grant founding status or award referral winners — those are owned by other agents and left as
// clearly-labeled hooks below for them to wire.
//
// SAFETY — this can charge the public, so it is guarded so it cannot fire by accident:
//   • APPROVER gate (approverGate): admin / janitor web_role only.
//   • EXPLICIT CONFIRM: the caller must pass the literal confirm phrase; anything else is refused.
//   • Any error returns a clean ActionResult failure (it never half-fires or throws to the UI).
//
// Nothing here runs until an operator deliberately calls it; billing_live stays FALSE by default, so the
// whole platform behaves exactly as today until graduation day.

import { ok, fail, type ActionResult } from '@/lib/action-result'
import { setPlatformFlag } from '@/lib/platform-flags'
import { approverGate } from './guard'
import { logBetaAction } from './audit'

/** The exact phrase graduateBeta() requires, so it can never fire from a stray click or a default arg. */
export const GRADUATE_CONFIRM = 'GRADUATE' as const

/**
 * GRADUATE THE BETA: turn billing live for the public and record it. Approver-gated + confirm-guarded.
 * Returns an ActionResult; on success billing_live is ON and a 'graduate_beta' audit row is written.
 */
export async function graduateBeta(confirm: string): Promise<ActionResult> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)

  if (confirm !== GRADUATE_CONFIRM) {
    return fail(`Type ${GRADUATE_CONFIRM} to confirm graduating the beta.`)
  }

  try {
    // Flip the public billing master switch ON. setPlatformFlag also appends a platform_flag_events audit
    // row (who/when/old→new), so the flag flip itself is independently traceable.
    await setPlatformFlag('billing_live', true, { changedBy: gate.profileId, source: 'admin' })
  } catch (err) {
    console.error('[beta] graduateBeta: could not flip billing_live:', err)
    return fail('Could not turn billing live. Nothing was changed.')
  }

  // GRADUATION HOOK: grant founding status (founding agent)
  // GRADUATION HOOK: award referral winners (referral agent)

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'graduate_beta',
    targetType: 'platform',
    targetId: null,
    detail: { billingLive: true, at: new Date().toISOString() },
  })

  return ok()
}
