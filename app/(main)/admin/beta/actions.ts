'use server'

// Beta Command Center server actions (Wave 1). Thin entrypoints over the approval
// spine (lib/beta/approvals.ts) for the Today "Needs approval" queue. Each returns
// an ActionResult and self-gates through the spine's APPROVER gate (admin/janitor).
// Wave 2 adds the compose/edit/admit actions; these are the arming actions.

import type { ActionResult } from '@/lib/action-result'
import {
  approve,
  pause,
  markReady,
  armPhase,
  type ApprovableType,
} from '@/lib/beta/approvals'

/** Arm one outbound item (ready → approved), or schedule it when a time is given. */
export async function approveOutbound(
  type: ApprovableType,
  id: string,
  scheduledFor?: string,
): Promise<ActionResult> {
  return approve({ type, id }, scheduledFor ? { scheduledFor } : {})
}

/** Halt one outbound item (→ paused). */
export async function pauseOutbound(type: ApprovableType, id: string): Promise<ActionResult> {
  return pause({ type, id })
}

/** Mark one outbound item ready for review (draft → ready). */
export async function markReadyOutbound(type: ApprovableType, id: string): Promise<ActionResult> {
  return markReady({ type, id })
}

/** Arm every `ready` item in a phase at once. */
export async function armPhaseAction(phaseId: string): Promise<ActionResult<{ approved: number }>> {
  return armPhase(phaseId)
}
