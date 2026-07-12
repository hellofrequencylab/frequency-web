'use server'

// Email Studio (2026) — Phase 4 SEND server actions. Thin, gated entrypoints over the
// send pipeline (lib/email-studio/send.ts). Each self-gates through the beta guard
// (lib/beta/guard.ts): scheduling / sending / pausing / cancelling are WRITES, so they
// run the approver gate; the read-only audience preview runs the lighter writer gate.
// The real send additionally re-checks the approval spine inside sendCampaignNow (a beta
// campaign passes assertApproved before a single email is enqueued).
//
// Each action returns an ActionResult the client discriminates with isError. Voice canon:
// no em dashes in any operator-facing copy.

import { revalidatePath } from 'next/cache'
import { type ActionResult, fail } from '@/lib/action-result'
import { approverGate, writerGate } from '@/lib/beta/guard'
import type { SegmentKey } from '@/lib/studio/campaigns'
import {
  scheduleCampaign,
  sendCampaignNow,
  pauseCampaign,
  cancelCampaign,
  countAudience,
  type CampaignStatus,
  type AudienceResult,
} from '@/lib/email-studio/send'

const STUDIO_PATH = '/admin/email-studio'

/** Preview an audience size for a segment (read-only). Writer-gated: a marketer may preview. */
export async function audiencePreviewAction(
  _campaignId: string,
  segment: SegmentKey,
): Promise<ActionResult<AudienceResult>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  return countAudience(segment)
}

/** Schedule a campaign for a future send. Approver-gated (scheduling arms a send). */
export async function scheduleCampaignAction(
  campaignId: string,
  input: { segment: SegmentKey; scheduledAt: string },
): Promise<ActionResult<{ scheduledFor: string; count: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const result = await scheduleCampaign(campaignId, input)
  revalidatePath(STUDIO_PATH)
  return result
}

/** Send a campaign now. Approver-gated here; the spine re-checks approval inside the send. */
export async function sendNowAction(campaignId: string): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const result = await sendCampaignNow(campaignId)
  revalidatePath(STUDIO_PATH)
  return result
}

/** Pause a scheduled or in-flight campaign. Approver-gated. */
export async function pauseAction(campaignId: string): Promise<ActionResult<{ status: CampaignStatus }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const result = await pauseCampaign(campaignId)
  revalidatePath(STUDIO_PATH)
  return result
}

/** Cancel a scheduled or paused campaign (terminal). Approver-gated. */
export async function cancelAction(campaignId: string): Promise<ActionResult<{ status: CampaignStatus }>> {
  const gate = await approverGate()
  if (!gate.ok) return fail(gate.error)
  const result = await cancelCampaign(campaignId)
  revalidatePath(STUDIO_PATH)
  return result
}
