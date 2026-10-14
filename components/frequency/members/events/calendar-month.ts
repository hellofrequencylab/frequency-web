import { addMonth, monthLabel } from '@/lib/events/calendar-grid'

// THE EVENTS CALENDAR VIEW'S MONTH, PURE (templates/members/app/events.js drawCal). The design draws
// a Monday-first month grid with the past days faded and today ringed; this builds that grid from
// the real rows on the server, so the client island only moves focus and never reads a clock or a
// zone (hydration-safe: every label below is a string decided here).
//
// `starts_at` stores the event's wall clock as UTC parts, so a row's day is its first ten
// characters and every time label formats in UTC. `today` is the community's day in HOME_TZ
// (dayInZone), passed in by the caller that owns the clock.

type CalendarChip = { id: string; href: string; title: string; time: string; going: boolean }
type CalendarCell = {
  /** YYYY-MM-DD, or null for a blank lead / trail cell outside the month. */
  key: string | null
  day: number | null
  /** "Thursday, October 15": the cell's spoken name. Empty on a blank cell. */
  label: string
  past: boolean
  today: boolean
  events: CalendarChip[]
}
export type CalendarMonth = {
  /** YYYY-MM */
  param: string
  title: string
  weeks: CalendarCell[][]
  /** Events (dates) inside this month. */
  total: number
  /** The previous / next month as YYYY-MM, or null where the view stops (nothing before this month
   *  is upcoming; the read holds about a year). */
  prev: string | null
  next: string | null
}

/** Monday-first weekday labels, the design's order. */
export const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** How far ahead the calendar pages. The listing read is horizon-bounded, so a year is plenty. */
export const MONTHS_AHEAD = 12

const pad = (n: number) => String(n).padStart(2, '0')
const toParam = (y: number, m1: number) => `${y}-${pad(m1)}`
const monthIndex = (y: number, m1: number) => y * 12 + (m1 - 1)

/** The month to show: `?month=YYYY-MM` when it is valid and inside the window, else this month. */
export function resolveMonth(raw: string | undefined, today: string): { year: number; month1: number } {
  const [ty, tm] = today.split('-').map(Number)
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? '')
  if (!m) return { year: ty, month1: tm }
  const y = Number(m[1])
  const m1 = Number(m[2])
  if (m1 < 1 || m1 > 12) return { year: ty, month1: tm }
  const delta = monthIndex(y, m1) - monthIndex(ty, tm)
  if (delta < 0 || delta > MONTHS_AHEAD) return { year: ty, month1: tm }
  return { year: y, month1: m1 }
}

export function chipTime(iso: string): string {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    d.getUTCMinutes() === 0 ? { hour: 'numeric', timeZone: 'UTC' } : { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
  return d.toLocaleTimeString('en-US', opts).replace(' ', '').toLowerCase()
}

function cellLabel(y: number, m1: number, day: number): string {
  return new Date(Date.UTC(y, m1 - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function buildCalendarMonth<
  T extends { id: string; slug: string; title: string; starts_at: string },
>(rows: T[], opts: { year: number; month1: number; today: string; going: (row: T) => boolean }): CalendarMonth {
  const { year, month1, today } = opts
  const prefix = toParam(year, month1)
  const byDay = new Map<string, CalendarChip[]>()
  let total = 0
  for (const r of rows) {
    if (r.starts_at.slice(0, 7) !== prefix) continue
    const key = r.starts_at.slice(0, 10)
    const list = byDay.get(key) ?? []
    list.push({ id: r.id, href: `/events/${r.slug}`, title: r.title, time: chipTime(r.starts_at), going: opts.going(r) })
    byDay.set(key, list)
    total++
  }

  const daysIn = new Date(Date.UTC(year, month1, 0)).getUTCDate()
  // getUTCDay: 0 = Sunday. Monday-first lead: Mon 0 ... Sun 6.
  const lead = (new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay() + 6) % 7
  const cells: CalendarCell[] = []
  for (let i = 0; i < lead; i++) cells.push({ key: null, day: null, label: '', past: false, today: false, events: [] })
  for (let day = 1; day <= daysIn; day++) {
    const key = `${prefix}-${pad(day)}`
    cells.push({
      key,
      day,
      label: cellLabel(year, month1, day),
      past: key < today,
      today: key === today,
      events: byDay.get(key) ?? [],
    })
  }
  while (cells.length % 7 !== 0) cells.push({ key: null, day: null, label: '', past: false, today: false, events: [] })
  const weeks: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const [ty, tm] = today.split('-').map(Number)
  const offset = monthIndex(year, month1) - monthIndex(ty, tm)
  const p = addMonth(year, month1, -1)
  const n = addMonth(year, month1, 1)
  return {
    param: prefix,
    title: monthLabel(year, month1),
    weeks,
    total,
    prev: offset > 0 ? toParam(p.year, p.month1) : null,
    next: offset < MONTHS_AHEAD ? toParam(n.year, n.month1) : null,
  }
}
