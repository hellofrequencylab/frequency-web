import { SNAP_MINUTES, snapMinutes } from './week-layout'
import type { PlannerTask } from './types'

// DROPPING AN INBOX TO-DO. The prototype made a second record (a to-do-kind item) when an undated
// to-do landed on a time, and left the original to-do drawing its due chip as well, so the same job
// showed twice. Here a drop is only ever an UPDATE to the same to-do: its due day, and when dropped
// on a time, its start. There is no create arm, so a second record cannot be written by this path.

/** A to-do with no estimate holds half an hour of the grid. */
export const DEFAULT_BLOCK_MINUTES = 30

interface TodoPatch {
  /** The to-do being changed: always the one that was dragged. */
  id: string
  due: string
  /** Only present for a drop on a time. */
  startMin?: number
  /** Only present for a drop on a time: the block's length in minutes, from the estimate. */
  blockMin?: number
}

interface TodoUpdate {
  type: 'update-todo'
  id: string
  patch: TodoPatch
}

/** Dropped on a day: the to-do is due that day. Any start it had stays. */
export function dropTodoOnDay(task: Pick<PlannerTask, 'id'>, day: string): TodoUpdate {
  return { type: 'update-todo', id: task.id, patch: { id: task.id, due: day } }
}

/** Dropped on a time: the same to-do gets that day as its due day and that minute as its start, on
 *  the 15 minute grid. The block is as long as the estimate, held inside the day. */
export function dropTodoOnTime(
  task: Pick<PlannerTask, 'id' | 'estHours'>,
  day: string,
  startMin: number,
): TodoUpdate {
  const blockMin = task.estHours && task.estHours > 0 ? Math.round(task.estHours * 60) : DEFAULT_BLOCK_MINUTES
  const snapped = snapMinutes(startMin, SNAP_MINUTES)
  const start = Math.max(0, Math.min(1440 - Math.min(blockMin, 1440), snapped))
  return { type: 'update-todo', id: task.id, patch: { id: task.id, due: day, startMin: start, blockMin } }
}

/** Applies an update to a copy of the to-do. Fields the patch does not carry are left as they were. */
export function applyTodoUpdate<T extends PlannerTask>(task: T, update: TodoUpdate): T {
  if (update.id !== task.id) return task
  const { due, startMin } = update.patch
  return startMin === undefined ? { ...task, due } : { ...task, due, startMin }
}
