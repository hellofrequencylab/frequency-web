// PLAYBOOKS (ADR-1386 P5). A Plan template: to-do titles, notes, event defaults.
// Pure: copying a playbook onto a Plan is one function.

export interface PlanPlaybook {
  id: string
  spaceId: string
  title: string
  eventType: string
  taskTitles: string[]
  notes: string | null
}

export function copyPlaybookToPlan(playbook: PlanPlaybook): {
  title: string
  notes: string | null
  taskTitles: string[]
} {
  return {
    title: playbook.title,
    notes: playbook.notes,
    taskTitles: playbook.taskTitles.filter((t) => t.trim()).slice(0, 40),
  }
}

/** One carried to-do: its words, and the offset that re-anchors it to the NEW date (ADR-1386 P5). */
export interface CarriedTask {
  title: string
  dueOffsetDays: number | null
}

/**
 * Run it again: copy a finished Plan onto a new date, clearing completion.
 *
 * THE OFFSET IS CARRIED, THE RESOLVED DUE DATE IS NOT. "Confirm the sound engineer, 14 days before"
 * is a fact about the plan and survives; "due 8 October" was a fact about the last time it ran and
 * would be nonsense on the new date. The copies resolve against whatever date the new Plan gets.
 */
export function runItAgain(opts: {
  title: string
  notes: string | null
  tasks: readonly CarriedTask[]
}): { title: string; notes: string | null; tasks: CarriedTask[] } {
  const base = opts.title.replace(/\s+\(again\)$/i, '').trim() || 'Plan'
  return {
    title: `${base} (again)`,
    notes: opts.notes,
    tasks: (opts.tasks ?? [])
      .map((t) => ({ title: t.title.trim(), dueOffsetDays: t.dueOffsetDays ?? null }))
      .filter((t) => t.title.length > 0),
  }
}
