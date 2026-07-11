'use server'

// ============================================================================
// Beta Command Center — Wave 2 EMAIL server actions. Thin entrypoints over the
// email data layer (lib/beta/email.ts), the approval spine (lib/beta/approvals.ts),
// the template seed (lib/beta/email-templates.ts), and Vera's copy editor
// (lib/beta/email-copy.ts). Each returns an ActionResult and self-gates inside the
// lib it calls. Kept OUT of the shared actions.ts (Wave-1 arming) on purpose.
//
// THE GOVERNING RULE lives one layer down: sendBetaCampaign → sendApprovedBetaCampaign
// calls assertApproved() before it enqueues a single email. Marking a campaign Ready
// runs the em-dash voice lint here first, so a voice violation cannot reach approval.
// ============================================================================

import type { ActionResult } from '@/lib/action-result'
import { fail } from '@/lib/action-result'
import { approve, pause, cancel, markReady } from '@/lib/beta/approvals'
import {
  createBetaCampaign,
  updateBetaCampaign,
  previewBetaSegment,
  sendApprovedBetaCampaign,
  sendBetaTestEmail,
  armFunnel,
  pauseFunnel,
  getBetaCampaign,
  lintVoice,
  type FunnelKind,
} from '@/lib/beta/email'
import { seedBetaEmailTemplates, type SeedResult } from '@/lib/beta/email-templates'
import { draftBetaEmailCopy, type BetaCopyRequest, type BetaCopyResult } from '@/lib/beta/email-copy'
import type { SegmentKey } from '@/lib/studio/campaigns'

// ── Compose / edit ───────────────────────────────────────────────────────────

export async function composeBetaCampaign(input: {
  subject: string
  body: string
  segment: SegmentKey
  phaseId: string
}): Promise<ActionResult<{ id: string }>> {
  return createBetaCampaign(input)
}

export async function editBetaCampaign(
  id: string,
  input: { subject: string; body: string; segment: SegmentKey },
): Promise<ActionResult> {
  return updateBetaCampaign(id, input)
}

export async function previewBetaSegmentAction(segment: SegmentKey): Promise<ActionResult<{ count: number }>> {
  return previewBetaSegment(segment)
}

// ── Lifecycle: Draft → Ready → Approved → Sent ─────────────────────────────────

/**
 * Mark a beta campaign Ready. Runs the em-dash voice lint on the current body FIRST:
 * a hard voice violation cannot pass into approval. Only when the copy is clean does
 * it call the spine's markReady (approver-gated + audited).
 */
export async function markBetaCampaignReady(id: string): Promise<ActionResult> {
  const campaign = await getBetaCampaign(id)
  if (!campaign) return fail('That campaign no longer exists.')
  const lint = lintVoice(`${campaign.subject}\n${campaign.body}`)
  if (lint.hasEmDash) {
    return fail('This copy has an em dash. Fix it (period, comma, or parentheses) before it can go Ready.')
  }
  return markReady({ type: 'campaign', id })
}

/** Arm a beta campaign now, or schedule it when a time is given (spine approve()). */
export async function approveBetaCampaign(id: string, scheduledFor?: string): Promise<ActionResult> {
  return approve({ type: 'campaign', id }, scheduledFor ? { scheduledFor } : {})
}

export async function pauseBetaCampaign(id: string): Promise<ActionResult> {
  return pause({ type: 'campaign', id })
}

export async function cancelBetaCampaign(id: string): Promise<ActionResult> {
  return cancel({ type: 'campaign', id })
}

/** THE SEND. Refuses (throws inside) unless the campaign is approved|scheduled. */
export async function sendBetaCampaign(id: string): Promise<ActionResult<{ recipientCount: number }>> {
  try {
    return await sendApprovedBetaCampaign(id)
  } catch (err) {
    // assertApproved throws when the campaign is not approved — surface it, do not send.
    return fail(err instanceof Error ? err.message : 'Refused: this campaign is not approved.')
  }
}

/** Test-send the campaign to the signed-in operator (never the real send). */
export async function testSendBetaCampaign(id: string): Promise<ActionResult<{ to: string }>> {
  return sendBetaTestEmail(id)
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function loadBetaTemplates(): Promise<ActionResult<SeedResult>> {
  return seedBetaEmailTemplates()
}

// ── Funnels ────────────────────────────────────────────────────────────────

export async function armBetaFunnel(kind: FunnelKind, id: string): Promise<ActionResult> {
  return armFunnel(kind, id)
}

export async function pauseBetaFunnel(kind: FunnelKind, id: string): Promise<ActionResult> {
  return pauseFunnel(kind, id)
}

// ── Vera copy editor ─────────────────────────────────────────────────────────

export async function draftBetaCopy(req: BetaCopyRequest): Promise<ActionResult<BetaCopyResult>> {
  return draftBetaEmailCopy(req)
}
