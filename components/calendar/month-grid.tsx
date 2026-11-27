import type { ReactNode } from 'react'
import { monthWeeks } from '@/lib/calendar/planner/month'
import { WEEKDAY_LETTERS, WEEKDAY_SHORT_LABELS } from '@/lib/calendar/week-start'

// THE ONE MONTH GRID (SCAN-1345, owner ruling 2026-10-28: merge the month grids once the suite landed).
// The public Calendar tab (components/events/event-calendar.tsx) and the team calendar
// (components/calendar-suite/suite-month.tsx) look different on purpose, but they are the same grid:
// the same weeks, starting on the same day, with the same weekday header order. That geometry lives
// here and only here. A surface brings its own day cell and its own classes; it never works out
// which column a date sits in.

/** One day of the grid: its YYYY-MM-DD key, and whether it belongs to the month being drawn (a
 *  padding day from the month before or after is drawn faded or blank, never as a real day). */
export interface MonthGridDay {
  date: string
  inMonth: boolean
}

/** The weeks of one month ('YYYY-MM'): whole weeks from the week's first day on or before the 1st. */
export function monthGridWeeks(ym: string): MonthGridDay[][] {
  return monthWeeks(ym).map((week) => week.map((date) => ({ date, inMonth: date.slice(0, 7) === ym })))
}

/** The weekday header labels, in grid order: 'short' ("Sun") or 'letter' ("S"). */
export function monthGridWeekdays(form: 'short' | 'letter' = 'short'): readonly string[] {
  return form === 'letter' ? WEEKDAY_LETTERS : WEEKDAY_SHORT_LABELS
}

/** The weekday header row. Each surface keeps its own look through the classes and the cell render. */
export function MonthGridWeekdays({
  className,
  form = 'short',
  role,
  hidden = false,
  cell,
}: {
  className?: string
  form?: 'short' | 'letter'
  /** 'row' when the surface is an ARIA grid. */
  role?: 'row'
  /** Decoration only: each day cell already names its own date. */
  hidden?: boolean
  /** Draws one header cell. The default is a plain span. */
  cell?: (label: string, index: number) => ReactNode
}) {
  return (
    <div className={className} role={role} aria-hidden={hidden || undefined}>
      {monthGridWeekdays(form).map((label, i) => (cell ? cell(label, i) : <span key={`${label}-${i}`}>{label}</span>))}
    </div>
  )
}
