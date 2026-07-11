'use server'

// Beta Command Center — phase + task edit actions (Wave 2). Thin 'use server'
// entrypoints over the content-writer-gated setters in lib/beta/phases.ts and
// lib/beta/tasks.ts, so the Phases client controls can call them directly.
//
// These are EDITS, not sends: they self-gate on writerGate (a staff web_role OR
// the marketing capability) inside the lib functions. The send-authorizing arm
// actions live in actions.ts (approveOutbound / pauseOutbound / markReadyOutbound
// / armPhaseAction) and stay APPROVER-gated there.

import type { ActionResult } from '@/lib/action-result'
import { updatePhaseStatus, type PhaseStatus } from '@/lib/beta/phases'
import { updateTaskStatus, type TaskStatus } from '@/lib/beta/tasks'

/** Set a phase's lifecycle status (not_started / in_progress / done). */
export async function setPhaseStatusAction(
  id: string,
  status: PhaseStatus,
): Promise<ActionResult> {
  return updatePhaseStatus(id, status)
}

/** Set a task's status (not_started / in_progress / done / blocked). */
export async function setTaskStatusAction(
  id: string,
  status: TaskStatus,
): Promise<ActionResult> {
  return updateTaskStatus(id, status)
}
