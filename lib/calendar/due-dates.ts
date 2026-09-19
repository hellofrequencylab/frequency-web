import type { CalendarEvent } from './item'
import type { EntryRow } from './entries'

// TASK DUE DATES as a calendar layer (ADR-1386 P4, ADR-1385 §7). One adapter: crm_tasks rows
// to CalendarEvent. Team only. The grid does not special-case them.

export interface PlanDueTask {
  id: string
  title: string
  dueAt: string
  planId: string | null
}

export function dueTaskToCalendarItem(task: PlanDueTask): CalendarEvent | null {
  const due = Date.parse(task.dueAt)
  if (Number.isNaN(due)) return null
  const dayKey = task.dueAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null
  return {
    slug: `todo-${task.id}`,
    title: task.title,
    dayKey,
    timeLabel: 'To-do',
    whenLabel: dayKey,
    startInstantIso: new Date(due).toISOString(),
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'todos',
    notes: task.planId ? 'Plan to-do' : null,
  }
}

export function dueTasksForDay(tasks: readonly PlanDueTask[], dayKey: string): CalendarEvent[] {
  return tasks
    .map(dueTaskToCalendarItem)
    .filter((item): item is CalendarEvent => !!item && item.dayKey === dayKey)
}

export function entryBelongsToPlan(entry: Pick<EntryRow, 'plan_id'>, planId: string): boolean {
  return entry.plan_id === planId
}

/** Due to-dos whose day sits in [fromDay, toDay). Team calendar only. */
export function dueTasksInWindow(
  tasks: readonly PlanDueTask[],
  fromDay: string,
  toDay: string,
): CalendarEvent[] {
  return tasks
    .map(dueTaskToCalendarItem)
    .filter((item): item is CalendarEvent => !!item && item.dayKey >= fromDay && item.dayKey < toDay)
}
