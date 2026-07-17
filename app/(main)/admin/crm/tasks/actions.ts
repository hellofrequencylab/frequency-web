'use server'

// Server actions for the Resonance CRM Tasks module (ADR-628). Staff-gated create / complete / snooze /
// reopen over the crm_tasks table (lib/crm/tasks.ts). Every action RE-CHECKS the same gate the page uses
// (the layout floor is not sufficient on its own) and returns the shared ActionResult so the client can
// report a write miss instead of a false success. Mirrors app/(main)/admin/crm/relationship-actions.ts.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { createTask, updateTaskStatus, type TaskStatus } from '@/lib/crm/tasks'

const GATE = { min: 'janitor', staff: 'marketing' } as const

/** Create a follow-up task. `contactId` is optional (a standalone to-do). The creator is the assignee
 *  unless `assigneeProfileId` is given. Returns the new task id. */
export async function createTaskAction(input: {
  title: string
  notes?: string | null
  dueAt?: string | null
  contactId?: string | null
  assigneeProfileId?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const { profileId } = await requireAdmin(GATE.min, { staff: GATE.staff })
  const title = (input.title ?? '').trim()
  if (!title) return fail('Give the task a title first.')

  const spaceId = (await loadRootSpaceId()) ?? null
  const res = await createTask(
    {
      createdBy: profileId,
      assigneeProfileId: input.assigneeProfileId ?? profileId,
      title,
      notes: input.notes ?? null,
      dueAt: input.dueAt ?? null,
      contactId: input.contactId ?? null,
    },
    spaceId,
  )
  if (!res) return fail('Could not save the task. Try again.')
  revalidatePath('/admin/crm/tasks')
  if (input.contactId) revalidatePath('/admin/crm/inbox')
  return ok(res)
}

/** Move a task to a new status. Snoozing may push the due date out via `dueAt`. */
export async function setTaskStatusAction(
  taskId: string,
  status: TaskStatus,
  opts?: { dueAt?: string | null },
): Promise<ActionResult> {
  await requireAdmin(GATE.min, { staff: GATE.staff })
  if (!taskId) return fail('Pick a task first.')
  const done = await updateTaskStatus(taskId, status, { dueAt: opts?.dueAt ?? null })
  if (!done) return fail('Could not update the task. Try again.')
  revalidatePath('/admin/crm/tasks')
  return ok()
}
