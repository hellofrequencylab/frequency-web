import type { CalendarEvent } from './item'
import { isOperatorListItem, operatorListHref, operatorStageLabel } from './pm-console'
import { monthKey } from './month-window'

// MONTHLY TIMELINE (ADR-1464). A linear time scale for one month, not a 7-column
// date grid. Days sit on the X axis. Each gathering is one row with a bar from
// its first day to its last day, clipped to the month.

export type TimelineDay = {
  dayKey: string
  day: number
  weekday: string
  isToday: boolean
}

export type TimelineBar = {
  key: string
  title: string
  whenLabel: string
  timeLabel: string
  stageLabel: string
  href: string | null
  isCancelled: boolean
  /** 1-based grid column inside the month. */
  startCol: number
  span: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function dayKeyUtc(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

function parseDayKey(dayKey: string): { year: number; month1: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!m) return null
  return { year: Number(m[1]), month1: Number(m[2]), day: Number(m[3]) }
}

export function monthTimelineDays(year: number, month1: number, todayKey: string): TimelineDay[] {
  const count = daysInMonth(year, month1)
  const days: TimelineDay[] = []
  for (let day = 1; day <= count; day += 1) {
    const dayKey = dayKeyUtc(year, month1, day)
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month1 - 1, day)).getUTCDay()] ?? ''
    days.push({ dayKey, day, weekday, isToday: dayKey === todayKey })
  }
  return days
}

function clipToMonth(
  startKey: string,
  endKey: string,
  year: number,
  month1: number,
): { startCol: number; span: number } | null {
  const start = parseDayKey(startKey)
  const end = parseDayKey(endKey)
  if (!start || !end) return null
  const monthStart = `${monthKey(year, month1)}-01`
  const last = daysInMonth(year, month1)
  const monthEnd = dayKeyUtc(year, month1, last)
  if (endKey < monthStart || startKey > monthEnd) return null
  const firstCol = startKey < monthStart ? 1 : start.day
  const lastCol = endKey > monthEnd ? last : end.day
  const span = lastCol - firstCol + 1
  if (span < 1) return null
  return { startCol: firstCol, span }
}

export function monthTimelineBars(events: CalendarEvent[], year: number, month1: number): TimelineBar[] {
  return events
    .filter(isOperatorListItem)
    .slice()
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey) || a.title.localeCompare(b.title))
    .flatMap((ev) => {
      const endKey = ev.endDayKey && ev.endDayKey >= ev.dayKey ? ev.endDayKey : ev.dayKey
      const clip = clipToMonth(ev.dayKey, endKey, year, month1)
      if (!clip) return []
      return [
        {
          key: `${ev.slug}|${ev.dayKey}`,
          title: ev.title,
          whenLabel: ev.whenLabel,
          timeLabel: ev.timeLabel,
          stageLabel: operatorStageLabel(ev),
          href: operatorListHref(ev),
          isCancelled: ev.isCancelled || ev.stage === 'cancelled',
          startCol: clip.startCol,
          span: clip.span,
        },
      ]
    })
}
