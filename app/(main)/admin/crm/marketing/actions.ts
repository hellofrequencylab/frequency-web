'use server'

// CRM › Marketing — the approval queue's server actions (LIVE-058). Thin, deliberately
// boring entrypoints over the approval spine (lib/outbound/approvals.ts). Each one
// delegates to the spine's transition and does nothing else:
//
//   • the spine self-gates every transition on approverGate (admin or janitor web_role
//     only), so there is no gate to duplicate here — adding one would create a second
//     place the rule lives;
//   • the spine writes the audit row and revalidates /admin/crm/marketing itself;
//   • these are FORM actions (lib/action-result.ts convention: form mutations throw
//     instead of returning), so a spine failure — a gate denial included — THROWS with
//     the spine's own message rather than being swallowed into a silent no-op. A denial
//     that vanished would be an invisible regression of "nothing sends without approval".
//
// These exist so the spine's transitions have a caller again: the Beta Command Center
// that used to drive them is gone (ADR-1089), and the approve panel on this tab is the
// surface that reviews and arms outbound now. approve() is the send-authorizing act, and
// assertApproved refuses everything else at send time.
//
// Voice canon: no em dashes in any operator-facing copy.

import { isError, type ActionResult } from '@/lib/action-result'
import { approve, pause, cancel, markReady } from '@/lib/outbound/approvals'

/** Unwrap a spine result for a form action: success is silence, failure is loud. */
function unwrap(result: ActionResult): void {
  if (isError(result)) throw new Error(result.error)
}

/** ARM one campaign: ready to approved. After this, the send gate clears. Approver-gated in the spine. */
export async function approveCampaignAction(campaignId: string): Promise<void> {
  unwrap(await approve({ type: 'campaign', id: campaignId }))
}

/** Hold a campaign (to paused). Reversible: it can be approved from the queue or cancelled later. */
export async function pauseCampaignAction(campaignId: string): Promise<void> {
  unwrap(await pause({ type: 'campaign', id: campaignId }))
}

/** Kill a campaign (to cancelled, terminal). */
export async function cancelCampaignAction(campaignId: string): Promise<void> {
  unwrap(await cancel({ type: 'campaign', id: campaignId }))
}

/** Put a draft up for review (draft to ready). The smallest honest path for the stranded
 *  phase-filed drafts: review first, then arm or cancel. Approver-gated in the spine. */
export async function markReadyCampaignAction(campaignId: string): Promise<void> {
  unwrap(await markReady({ type: 'campaign', id: campaignId }))
}
