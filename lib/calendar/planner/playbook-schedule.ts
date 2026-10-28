import { describeOffset, resolveDueFromOffset } from '../relative-schedule'
import type { TodoPhase } from './types'

// PLAYBOOK SCHEDULING. A playbook is a starter list of to-dos counted back from the event. Picking one
// when you pencil a date turns each line into a to-do with a real due day, anchored on the EARLIEST
// date held (option A), so the prep list counts down to the first time the thing could happen.
//
// The offsets are stored the way lib/calendar/relative-schedule.ts stores them: signed, negative =
// before. Because the offset is kept next to the resolved day, moving the date later moves the prep
// with it (reanchorPlanTodos), which the prototype could not do.

interface PlaybookLine {
  title: string
  /** Days before the event; 0 is the day itself and a negative number is after. */
  daysBefore: number
}

interface PlannerPlaybook {
  id: string
  name: string
  lines: readonly PlaybookLine[]
}

/** The built-in playbooks. Start blank adds nothing. */
export const PLAYBOOKS: readonly PlannerPlaybook[] = [
  {
    id: 'sound-bath',
    name: 'Sound bath',
    lines: [
      { title: 'Confirm practitioner', daysBefore: 21 },
      { title: 'Post to socials', daysBefore: 14 },
      { title: 'Order mats', daysBefore: 7 },
      { title: 'Set up the room', daysBefore: 0 },
      { title: 'Thank-you note to guests', daysBefore: -1 },
    ],
  },
  {
    id: 'market-day',
    name: 'Market day',
    lines: [
      { title: 'Vendor list', daysBefore: 42 },
      { title: 'Permit', daysBefore: 28 },
      { title: 'Map the stalls', daysBefore: 14 },
      { title: 'Signage', daysBefore: 7 },
      { title: 'Load-in', daysBefore: 0 },
      { title: 'Vendor payouts', daysBefore: -3 },
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop',
    lines: [
      { title: 'Book the facilitator', daysBefore: 14 },
      { title: 'Write the page', daysBefore: 10 },
      { title: 'Prep materials', daysBefore: 2 },
      { title: 'Follow-up email', daysBefore: -1 },
    ],
  },
  { id: 'blank', name: 'Start blank', lines: [] },
]

/** A manually added to-do is due this many days before the next date. */
const MANUAL_LEAD_DAYS = 3
/** Hours a playbook to-do is estimated at. */
const PLAYBOOK_ESTIMATE_HOURS = 0.5

/** The playbook with this id, or undefined. */
export function findPlaybook(id: string | null | undefined): PlannerPlaybook | undefined {
  return PLAYBOOKS.find((p) => p.id === id)
}

/** The one-line pitch under a playbook's name: "5 to-dos, starts 3 weeks out" or "Add to-dos as you go". */
export function playbookHint(playbook: PlannerPlaybook): string {
  if (!playbook.lines.length) return 'Add to-dos as you go'
  const lead = Math.max(...playbook.lines.map((l) => l.daysBefore))
  const n = playbook.lines.length
  const weeks = Math.round(lead / 7)
  return `${n} to-dos, starts ${weeks} ${weeks === 1 ? 'week' : 'weeks'} out`
}

/** Before, Day of or After, from a signed offset (negative = before). */
export function phaseOfOffset(dueOffsetDays: number): TodoPhase {
  return dueOffsetDays < 0 ? 'Before' : dueOffsetDays === 0 ? 'Day of' : 'After'
}

interface ScheduledTodo {
  title: string
  /** The day it is due, or null when no date is held yet. */
  due: string | null
  /** Signed days from the event (negative = before), as the database stores it. */
  dueOffsetDays: number
  phase: TodoPhase
  estHours: number
  /** "21 days before", "on the day", "1 day after". */
  label: string
  /** True when the due day is already past on the day the Plan is made. */
  overdue: boolean
}

/** The to-dos a playbook adds for a set of held dates, counted back from the earliest. */
export function schedulePlaybook(
  playbookId: string | null | undefined,
  dates: readonly string[],
  today: string,
): ScheduledTodo[] {
  const playbook = findPlaybook(playbookId)
  if (!playbook) return []
  const anchor = [...dates].filter(Boolean).sort()[0] ?? null
  return playbook.lines.map((line) => {
    const dueOffsetDays = line.daysBefore === 0 ? 0 : -line.daysBefore
    const due = anchor ? resolveDueFromOffset(anchor, dueOffsetDays) : null
    return {
      title: line.title,
      due,
      dueOffsetDays,
      phase: phaseOfOffset(dueOffsetDays),
      estHours: PLAYBOOK_ESTIMATE_HOURS,
      label: describeOffset(dueOffsetDays) ?? '',
      overdue: !!due && due < today,
    }
  })
}

/** Group to-dos Before / Day of / After, dropping empty groups. Within a group, earliest due first. */
export function groupByPhase<T extends { phase?: TodoPhase | null; due: string | null }>(
  todos: readonly T[],
): { phase: TodoPhase; todos: T[] }[] {
  const order: TodoPhase[] = ['Before', 'Day of', 'After']
  return order
    .map((phase) => ({
      phase,
      todos: todos
        .filter((t) => t.phase === phase)
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')),
    }))
    .filter((g) => g.todos.length > 0)
}

/** A to-do added by hand to a Plan: due three days before the next date, or undated with no date. */
export function manualTodo(
  title: string,
  nextDate: string | null,
): { title: string; due: string | null; dueOffsetDays: number | null; phase: TodoPhase | null; estHours: number } {
  const due = nextDate ? resolveDueFromOffset(nextDate, -MANUAL_LEAD_DAYS) : null
  return {
    title: title.trim(),
    due,
    dueOffsetDays: due ? -MANUAL_LEAD_DAYS : null,
    phase: due ? 'Before' : null,
    estHours: PLAYBOOK_ESTIMATE_HOURS,
  }
}
