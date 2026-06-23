'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for per-space tasks (CRM-STRATEGY §6/§7).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure helpers or
// the shared types. Those live in lib/crm/space-tasks.ts (no directive: pure helpers + IO + the action
// implementations + types, all unit-testable). This thin file is the seam the CLIENT tasks panel
// imports, so the mutations cross the network boundary as proper Server Actions:
//   space-tasks-panel.tsx -> createTask / updateTask / setTaskDone / deleteTask
//
// The authorization (owner gate) + validation + space scoping all live in the implementations; these
// wrappers just re-expose them, so the gate is re-checked server-side and can never be bypassed.

import {
  createTask as createTaskImpl,
  updateTask as updateTaskImpl,
  setTaskDone as setTaskDoneImpl,
  deleteTask as deleteTaskImpl,
  type TaskInput,
} from '@/lib/crm/space-tasks'
import { type ActionResult } from '@/lib/action-result'

/** Create a task. Gated on canEditProfile + space-scoped (see the implementation). */
export async function createTask(
  spaceId: string,
  input: TaskInput,
  slug?: string,
): Promise<ActionResult<{ id: string }>> {
  return createTaskImpl(spaceId, input, slug)
}

/** Edit a task (title / due date / links). Gated on canEditProfile + space-scoped. */
export async function updateTask(
  spaceId: string,
  taskId: string,
  patch: TaskInput,
  slug?: string,
): Promise<ActionResult> {
  return updateTaskImpl(spaceId, taskId, patch, slug)
}

/** Mark a task complete or reopen it. Gated on canEditProfile + space-scoped. */
export async function setTaskDone(
  spaceId: string,
  taskId: string,
  done: boolean,
  slug?: string,
): Promise<ActionResult> {
  return setTaskDoneImpl(spaceId, taskId, done, slug)
}

/** Delete a task. Gated on canEditProfile + space-scoped. */
export async function deleteTask(spaceId: string, taskId: string, slug?: string): Promise<ActionResult> {
  return deleteTaskImpl(spaceId, taskId, slug)
}
