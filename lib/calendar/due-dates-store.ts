import 'server-only'
import { listTasks } from '@/lib/crm/tasks'
import { dueTasksInWindow, type PlanDueTask } from './due-dates'
import type { CalendarEvent } from './item'

// TASK DUE DATES IO (ADR-1386 P4). Service-role crm_tasks behind a staff-gated caller.
// The mapping stays in due-dates.ts.

export async function listDueDateItems(
  spaceId: string,
  fromDay: string,
  toDay: string,
): Promise<CalendarEvent[]> {
  const tasks = await listTasks({ spaceId, limit: 200 })
  const due: PlanDueTask[] = tasks
    .filter((t) => t.status !== 'done' && t.dueAt)
    .map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt as string, planId: t.planId }))
  return dueTasksInWindow(due, fromDay, toDay)
}
