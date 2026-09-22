'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listTasks, updateTaskStatusInScope, type CrmTask } from '@/lib/crm/tasks'
import { fail, ok, type ActionResult } from '@/lib/action-result'

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

/** Every to-do under this Space: Plan to-dos and CRM follow-ups alike, one list (owner ruling 3). */
export async function listSpaceTasks(slug: string): Promise<CrmTask[]> {
  const editor = await resolveEditor(slug)
  if (!editor) return []
  return listTasks({ spaceId: editor.spaceId, limit: 500 })
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
  const moved = await updateTaskStatusInScope(taskId, done ? 'done' : 'open', {
    spaceId: editor.spaceId,
  })
  if (!moved) return fail('That to-do could not be updated.')
  revalidatePath(`/spaces/${slug}/settings/calendar`)
  revalidatePath(`/spaces/${slug}/calendar`)
  return ok()
}
