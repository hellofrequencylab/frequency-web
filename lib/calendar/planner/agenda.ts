import { dayItems } from './day-items'
import { addDays, clockLabel, dayLabel, weekdayName } from './days'
import type { PlannerData, PlannerKind } from './types'

// THE AGENDA: the next 45 days as a list, one block per day that has anything on it. It starts at
// today when the cursor is in today's month, else at the first of the cursor's month. Cancelled
// items stay in (struck through by the view); the month grid is the only place they are dropped.

const AGENDA_DAYS = 45

interface AgendaRow {
  src: 'item' | 'todo'
  id: string
  title: string
  kind: PlannerKind
  /** "9:30 AM to 5 PM", "All day", "Through Fri, Oct 23", "Due today", "Overdue", "Due", "Done". */
  range: string
  planTitle: string
  owner: string | null
  /** "24 going", or empty. */
  going: string
  cancelled: boolean
  done: boolean
}

export interface AgendaDay {
  key: string
  weekday: string
  /** "Today", "Tomorrow" or empty. */
  rel: string
  rows: AgendaRow[]
}

/** The agenda from `cursor`, 45 days long, skipping days with nothing on them. */
export function buildAgenda(
  data: PlannerData,
  cursor: string,
  today: string,
  ownSpaceId: string,
  days: number = AGENDA_DAYS,
): AgendaDay[] {
  const from = cursor.slice(0, 7) === today.slice(0, 7) ? today : `${cursor.slice(0, 7)}-01`
  const planTitle = (id?: string | null) => data.plans.find((p) => p.id === id)?.title ?? ''
  const out: AgendaDay[] = []
  for (let d = 0; d < days; d++) {
    const key = addDays(from, d)
    const { items, todos } = dayItems(data, key, ownSpaceId)
    if (!items.length && !todos.length) continue
    out.push({
      key,
      weekday: weekdayName(key),
      rel: key === today ? 'Today' : key === addDays(today, 1) ? 'Tomorrow' : '',
      rows: [
        ...items.map((it): AgendaRow => ({
          src: 'item',
          id: it.id,
          title: it.title,
          kind: it.kind,
          range: it.end
            ? `Through ${dayLabel(it.end)}`
            : it.startMin == null
              ? 'All day'
              : `${clockLabel(it.startMin)} to ${clockLabel(it.startMin + it.durMin)}`,
          planTitle: planTitle(it.plan),
          owner: it.owner ?? null,
          going: it.going ? `${it.going} going` : '',
          cancelled: it.kind === 'cancelled',
          done: false,
        })),
        ...todos.map((t): AgendaRow => ({
          src: 'todo',
          id: t.id,
          title: t.title,
          kind: 'todo',
          range: t.done ? 'Done' : key === today ? 'Due today' : key < today ? 'Overdue' : 'Due',
          planTitle: planTitle(t.plan),
          owner: t.owner ?? null,
          going: '',
          cancelled: false,
          done: t.done,
        })),
      ],
    })
  }
  return out
}

