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

/** Run it again: copy a finished Plan onto a new date, clearing completion. */
export function runItAgain(opts: {
  title: string
  notes: string | null
  taskTitles: readonly string[]
}): { title: string; notes: string | null; taskTitles: string[] } {
  const base = opts.title.replace(/\s+\(again\)$/i, '').trim() || 'Plan'
  return {
    title: `${base} (again)`,
    notes: opts.notes,
    taskTitles: opts.taskTitles.map((t) => t.trim()).filter(Boolean),
  }
}
