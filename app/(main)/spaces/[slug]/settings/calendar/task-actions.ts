'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { assignTaskInPlan, getTaskInPlans, getTaskInScope, updateTaskStatusInPlans, updateTaskStatusInScope, type CrmTask } from '@/lib/crm/tasks'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { recordPlanActivity } from '@/lib/calendar/plan-activity-store'
import { getSpacePlan, listPlansSharedWith, listSharedPlanIds } from '@/lib/calendar/plans-store'
import { assigneeChoicesForPlan, listTasksWithShared } from '@/lib/calendar/shared-tasks'
import { assignmentWords, type AssigneeChoice } from '@/lib/calendar/shared-tasks-core'

// THE SPACE TO-DO INBOX, server half (PROG-CAL4 "My tasks").
//
// 🔴 WHY THIS EXISTS AT ALL. PROG-CAL4 named an inbox that merges plan tasks and CRM follow-ups,
// and the row was closed without one. `filterTasks` and `sortTasks` have been in lib/crm/tasks.ts,
// tested, since ADR-628, with exactly ONE caller in the tree: app/(main)/admin/crm/tasks, a
// PLATFORM-STAFF surface. A Space owner had no list of their own to-dos anywhere in the product —
// they could add one from a Plan drawer and never see it again unless they reopened that Plan.
//
// The row's probe measured a todos layer, a due-date adapter, stackDay and a board, and never
// asked whether an owner could SEE their tasks. That is the HYG-108 shape one row later.
//
// GATE. `listTasks` and `updateTaskStatusInScope` reach crm_tasks with the SERVICE-ROLE client, so
// every export here proves the caller may edit THIS Space first and then passes that Space's own
// id as the scope. Same shape as plan-actions.ts, deliberately: one gate, one scope, no third way.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveEditor(slug: string): Promise<{ spaceId: string; profileId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller?.id) return null
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  if (!caps.canEditProfile) return null
  return { spaceId: space.id, profileId: caller.id }
}

/** Every to-do under this Space: Plan to-dos and CRM follow-ups alike, one list (owner ruling 3),
 *  plus the to-dos of every Plan another Space shared with this one, marked with the host's name
 *  (LIVE-544), so what a team was handed reaches the people meant to do it. */
export async function listSpaceTasks(slug: string): Promise<CrmTask[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  return listTasksWithShared(editor.spaceId)
}

/** Tick one off. Scoped by space_id, so a task id from another Space matches no row. */
export async function setSpaceTaskDone(
  slug: string,
  taskId: string,
  done: boolean,
): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this Space.')
  if (typeof taskId !== 'string' || !UUID_RE.test(taskId)) return fail('That to-do no longer exists.')
  let moved = await updateTaskStatusInScope(taskId, done ? 'done' : 'open', {
    spaceId: editor.spaceId,
  })
  let task: CrmTask | null = moved ? await getTaskInScope(taskId, editor.spaceId) : null
  if (!moved) {
    // Not this Space's own row. A to-do of a Plan SHARED with this Space may still be ticked
    // (LIVE-544): the scope widens to exactly the accepted shares the session returns.
    const shared = await listSharedPlanIds(editor.spaceId)
    moved = shared.length > 0 && (await updateTaskStatusInPlans(taskId, done ? 'done' : 'open', shared))
    if (moved) task = await getTaskInPlans(taskId, shared)
  }
  if (!moved) return fail('That to-do could not be updated.')
  // A to-do that belongs to a Plan writes the Plan's record (LIVE-543), so the other team learns
  // it was done from the inbox as surely as from the drawer. A CRM follow-up has no Plan and no row.
  if (task?.planId) {
    await recordPlanActivity({
      planId: task.planId,
      actorProfileId: editor.profileId,
      actorSpaceId: editor.spaceId,
      kind: 'todo_done',
      summary: done ? `Ticked off "${task.title}".` : `Put "${task.title}" back on the list.`,
    })
  }
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  revalidatePath(`/spaces/${slug}/calendar`)
  return ok()
}

// ── HANDING A TO-DO ACROSS THE SHARE (PROG-CAL7 Together, LIVE-544) ──────────────────────────────

/** The to-do the caller may reach: this Space's own, or one on a Plan shared with this Space. */
async function reachableTask(editor: { spaceId: string }, taskId: string): Promise<CrmTask | null> {
  const own = await getTaskInScope(taskId, editor.spaceId)
  if (own) return own
  const shared = await listSharedPlanIds(editor.spaceId)
  return shared.length > 0 ? getTaskInPlans(taskId, shared) : null
}

/** Whether the caller's Space is this Plan's host or holds an accepted share of it, and the host. */
async function reachablePlanHost(editor: { spaceId: string }, planId: string): Promise<string | null> {
  const own = await getSpacePlan(editor.spaceId, planId)
  if (own) return own.spaceId
  const shared = await listSharedPlanIds(editor.spaceId)
  if (!shared.includes(planId)) return null
  return (await listPlansSharedWith(editor.spaceId)).find((p) => p.id === planId)?.spaceId ?? null
}

/** Everyone a to-do of this Plan may be handed to: both teams by name when the Plan is shared,
 *  this team alone when it is not. Empty for a Plan the caller cannot reach. */
export async function listPlanAssignees(slug: string, planId: string): Promise<ActionResult<AssigneeChoice[]>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this Space.')
  if (typeof planId !== 'string' || !UUID_RE.test(planId)) return fail('That Plan no longer exists.')
  const host = await reachablePlanHost(editor, planId)
  if (!host) return fail('That Plan no longer exists.')
  return ok(await assigneeChoicesForPlan(planId, host))
}

/**
 * Hand a Plan to-do to a person on either team, or to nobody. The caller must edit the host Space
 * or an accepted guest Space of the to-do's Plan (the to-do is re-read inside that scope), and the
 * assignee must be on the list both teams share: never a free profile id from the browser. The
 * write is bound to the proven Plan id, and the Plan's record says who it went to.
 */
export async function assignPlanTodo(slug: string, taskId: string, rawProfileId: unknown): Promise<ActionResult<void>> {
  const editor = await resolveEditor(slug)
  if (!editor) return fail('You do not have access to this Space.')
  if (typeof taskId !== 'string' || !UUID_RE.test(taskId)) return fail('That to-do no longer exists.')
  const task = await reachableTask(editor, taskId)
  if (!task?.planId) return fail('That to-do is not on a Plan.')
  const host = await reachablePlanHost(editor, task.planId)
  if (!host) return fail('That Plan no longer exists.')
  let assignee: string | null = null
  let label: string | null = null
  if (rawProfileId !== null && rawProfileId !== undefined && rawProfileId !== '') {
    if (typeof rawProfileId !== 'string' || !UUID_RE.test(rawProfileId)) return fail('Pick someone from the list.')
    const choice = (await assigneeChoicesForPlan(task.planId, host)).find((c) => c.value === rawProfileId)
    if (!choice) return fail('Pick someone on one of the two teams.')
    assignee = choice.value
    label = choice.label
  }
  const stamped = await assignTaskInPlan(taskId, assignee, task.planId)
  if (!stamped) return fail('That to-do could not be handed over.')
  await recordPlanActivity({
    planId: task.planId,
    actorProfileId: editor.profileId,
    actorSpaceId: editor.spaceId,
    kind: 'todo_assigned',
    summary: assignmentWords(task.title, label),
  })
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  revalidatePath(`/spaces/${slug}/calendar`)
  return ok()
}
