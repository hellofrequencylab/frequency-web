import { KINDS, TODO_DOT } from './kinds'
import { addDays, dayLabel, diffDays, lastDay, mondayOnOrBefore, monthDayLabel } from './days'
import { planStats, stageLabel, type Health } from './board'
import type { PlannerData } from './types'

// THE TIMELINE: nine weeks that start the Monday before this week, one row per live Plan, with a bar
// from its first date or due to-do to its last, a mark per date and a dot per to-do. Positions are
// percentages of the 63 day span, clamped to it; a bar that runs past either edge says so, so the
// view can draw a chevron instead of passing off a clamped edge as a real date.

export const TIMELINE_WEEKS = 9
export const TIMELINE_DAYS = TIMELINE_WEEKS * 7
/** The narrowest a bar or mark is drawn, in percent of the span, so a one-day date stays visible. */
const MIN_MARK_PCT = 1.6

type DueState = 'upcoming' | 'overdue' | 'done'

export interface TimelineMark {
  id: string
  leftPct: number
  widthPct: number
  /** The date's kind color. */
  color: string
  title: string
}

interface TimelineDue {
  id: string
  leftPct: number
  state: DueState
  color: string
  title: string
}

export interface TimelineRow {
  id: string
  title: string
  stage: string
  health: Health
  team: string[]
  bar: { leftPct: number; widthPct: number; bg: string; bd: string; startsBefore: boolean; endsAfter: boolean }
  marks: TimelineMark[]
  dues: TimelineDue[]
  /** Where the hold lapses, percent of the span, or null. */
  holdPct: number | null
}

export interface Timeline {
  /** First day of the span: last Monday. */
  start: string
  weeks: { label: string; leftPct: number }[]
  todayPct: number
  rows: TimelineRow[]
}

/** State of a to-do's dot: done wins, then overdue by the due day, else upcoming. */
export function dueState(due: string, done: boolean, today: string): DueState {
  return done ? 'done' : due < today ? 'overdue' : 'upcoming'
}

/** The nine-week timeline for the live (not cancelled) Plans. */
export function buildTimeline(data: PlannerData, today: string): Timeline {
  const start = addDays(mondayOnOrBefore(today), -7)
  const spanEnd = addDays(start, TIMELINE_DAYS)
  const pos = (key: string) => Math.max(0, Math.min(100, (diffDays(start, key) * 100) / TIMELINE_DAYS))
  const fit = (left: number, width: number) => {
    const w = Math.max(MIN_MARK_PCT, width)
    return { leftPct: Math.min(left, 100 - w), widthPct: w }
  }

  const weeks = Array.from({ length: TIMELINE_WEEKS }, (_, w) => ({
    label: monthDayLabel(addDays(start, w * 7)),
    leftPct: (w * 7 * 100) / TIMELINE_DAYS,
  }))

  const rows = data.plans
    .filter((p) => p.stage !== 'cancelled')
    .map((plan): TimelineRow => {
      const s = planStats(plan, data, today)
      const days = [...s.items.map((i) => i.date), ...s.todos.filter((t) => t.due).map((t) => t.due!)].sort()
      const first = days[0] ?? today
      const lastDue = days[days.length - 1] ?? first
      const lastItem = s.items.length ? lastDay(s.items[s.items.length - 1]) : lastDue
      const last = lastItem > lastDue ? lastItem : lastDue
      const look = KINDS[plan.stage]
      return {
        id: plan.id,
        title: plan.title,
        stage: stageLabel(plan.stage),
        health: s.health,
        team: plan.team,
        bar: {
          ...fit(pos(first), pos(addDays(last, 1)) - pos(first)),
          bg: look.bg,
          bd: look.bd,
          startsBefore: first < start,
          endsAfter: addDays(last, 1) > spanEnd,
        },
        marks: s.items.map((i) => ({
          id: i.id,
          ...fit(pos(i.date), pos(addDays(lastDay(i), 1)) - pos(i.date)),
          color: KINDS[i.kind].dot,
          title: `${i.title} · ${dayLabel(i.date)}`,
        })),
        dues: s.todos
          .filter((t) => t.due)
          .map((t) => {
            const state = dueState(t.due!, t.done, today)
            return { id: t.id, leftPct: pos(t.due!), state, color: TODO_DOT[state], title: `${t.title} · due ${dayLabel(t.due!)}` }
          }),
        holdPct: plan.hold ? pos(plan.hold) : null,
      }
    })

  return { start, weeks, todayPct: pos(today), rows }
}
