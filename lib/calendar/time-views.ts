import { isDayBand, type CalendarEvent } from './item'
import type { CalendarLayerKey } from './registry'
import type { SpacePlan } from './plans'

// THE TIME VIEWS: DAY, WEEK AND TIMELINE (LIVE-1178, Space calendar redesign phases 7 and 8). Pure
// math over CalendarEvent items: no React, no clock, no zone lib. The operator surfaces (Month,
// Agenda, Board) are unchanged; these three are a second way of looking that rides beside them, so
// the pinned CALENDAR_SURFACES and CALENDAR_ADMIN_VIEWS lists keep their values.
//
// EVERY HOUR IS THE ITEM'S OWN WALL CLOCK. `timeLabel` ("7:00 PM") is formatted in the item's zone by
// the server (the events convention, lib/time/zone.ts), so reading hours out of it needs no zone
// conversion on the client and the grid agrees with the month chip by construction.

const CALENDAR_TIME_VIEWS = ['day', 'week', 'timeline'] as const
export type CalendarTimeView = (typeof CALENDAR_TIME_VIEWS)[number]

export const CALENDAR_TIME_VIEW_DEFS: readonly { view: CalendarTimeView; label: string }[] = [
  { view: 'day', label: 'Day' },
  { view: 'week', label: 'Week' },
  { view: 'timeline', label: 'Timeline' },
] as const

export function parseTimeView(raw: string | string[] | null | undefined): CalendarTimeView | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  return CALENDAR_TIME_VIEWS.includes(value as CalendarTimeView) ? (value as CalendarTimeView) : null
}

/** Per-Space cookie for the last time view, beside the surface cookie (ADR-1467). A separate cookie
 *  because `freq-cal-view-*` names the operator PANEL and its values are pinned. An empty value
 *  means "back on the month". */
function timeViewCookieName(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 80).toLowerCase()
  return `freq-cal-look-${safe || 'space'}`
}

export function rememberTimeView(slug: string, view: CalendarTimeView | null): void {
  if (typeof document === 'undefined') return
  document.cookie = `${timeViewCookieName(slug)}=${view ?? ''}; Path=/; Max-Age=31536000; SameSite=Lax`
}

// ─── DAY KEYS ────────────────────────────────────────────────────────────────────────────────────

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

function dayMs(dayKey: string): number {
  const m = DAY_RE.exec(dayKey)
  if (!m) return Number.NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function addDays(dayKey: string, delta: number): string {
  const ms = dayMs(dayKey)
  if (Number.isNaN(ms)) return dayKey
  return new Date(ms + delta * MS_PER_DAY).toISOString().slice(0, 10)
}

/** 0 = Monday ... 6 = Sunday. The design's week starts on Monday. */
function mondayIndex(dayKey: string): number {
  const ms = dayMs(dayKey)
  if (Number.isNaN(ms)) return 0
  return (new Date(ms).getUTCDay() + 6) % 7
}

export function weekStart(dayKey: string): string {
  return addDays(dayKey, -mondayIndex(dayKey))
}

export function weekDayKeys(dayKey: string, count = 7): string[] {
  const start = weekStart(dayKey)
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayMs(b) - dayMs(a)) / MS_PER_DAY)
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function weekdayName(dayKey: string): string {
  return WEEKDAYS[mondayIndex(dayKey)]
}

export function shortWeekdayName(dayKey: string): string {
  return weekdayName(dayKey).slice(0, 3)
}

export function dayOfMonth(dayKey: string): number {
  return Number(dayKey.slice(8, 10))
}

/** "Oct 26", the way the timeline's week ticks and pills read. */
export function shortDateLabel(dayKey: string): string {
  return `${MONTHS[Number(dayKey.slice(5, 7)) - 1] ?? ''} ${dayOfMonth(dayKey)}`
}

/** "Mon, Oct 26": the Day view's title. */
export function dayTitle(dayKey: string): string {
  return `${shortWeekdayName(dayKey)}, ${shortDateLabel(dayKey)}`
}

/** "Oct 26 to Nov 1": the Week view's title. */
export function weekTitle(dayKey: string): string {
  const start = weekStart(dayKey)
  return `${shortDateLabel(start)} to ${shortDateLabel(addDays(start, 6))}`
}

// ─── THE TIME GRID ───────────────────────────────────────────────────────────────────────────────

/** 7 AM to 11 PM at 52px an hour (the design). */
export const GRID_START_HOUR = 7
export const GRID_END_HOUR = 23
export const HOUR_PX = 52
/** An item with no end time holds this long. */
const DEFAULT_DURATION_MIN = 60
/** The shortest block the grid draws, so a 15 minute item stays readable. */
const MIN_BLOCK_MIN = 30

const CLOCK_RE = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/

/** Minutes since midnight for a label like "7:00 PM" or "7 pm". Null for "All day", "To-do" and
 *  anything else that is not a clock time. */
export function clockMinutes(label: string | null | undefined): number | null {
  const m = CLOCK_RE.exec((label ?? '').trim())
  if (!m) return null
  const hour12 = Number(m[1])
  const minute = Number(m[2] ?? '0')
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null
  const pm = m[3].toLowerCase() === 'p'
  return ((hour12 % 12) + (pm ? 12 : 0)) * 60 + minute
}

/** Items that touch `dayKey`: starting on it, or a run that covers it. */
function itemsOnDay(items: readonly CalendarEvent[], dayKey: string): CalendarEvent[] {
  return items.filter((item) => item.dayKey <= dayKey && (item.endDayKey || item.dayKey) >= dayKey)
}

export interface TimedBlock {
  item: CalendarEvent
  startMin: number
  endMin: number
  /** 0-based column inside its cluster of overlapping blocks. */
  lane: number
  /** How many columns the cluster has, so a block is `1 / lanes` wide. */
  lanes: number
}

interface DayLayout {
  /** Whole-day runs, to-dos and anything without a clock time: the all-day row. */
  allDay: CalendarEvent[]
  timed: TimedBlock[]
}

function itemWindow(item: CalendarEvent): { startMin: number; endMin: number } | null {
  const start = clockMinutes(item.timeLabel)
  if (start === null) return null
  const end = clockMinutes(item.endTimeLabel)
  const floor = GRID_START_HOUR * 60
  const ceil = GRID_END_HOUR * 60
  const startMin = Math.min(Math.max(start, floor), ceil - MIN_BLOCK_MIN)
  const rawEnd = end !== null && end > start ? end : start + DEFAULT_DURATION_MIN
  const endMin = Math.min(Math.max(rawEnd, startMin + MIN_BLOCK_MIN), ceil)
  return { startMin, endMin }
}

/** One day: the all-day row and the timed blocks, with overlaps packed into lanes. A cluster is a run
 *  of blocks where each starts before the previous ones have all ended; every block in it shares the
 *  cluster's lane count, so they sit side by side at one width instead of ragged. */
export function layoutDay(items: readonly CalendarEvent[], dayKey: string): DayLayout {
  const onDay = itemsOnDay(items, dayKey)
  const allDay: CalendarEvent[] = []
  const windows: { item: CalendarEvent; startMin: number; endMin: number }[] = []
  for (const item of onDay) {
    const win = isDayBand(item) ? null : itemWindow(item)
    if (win) windows.push({ item, ...win })
    else allDay.push(item)
  }
  windows.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  const timed: TimedBlock[] = []
  let cluster: { item: CalendarEvent; startMin: number; endMin: number; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const block of cluster) timed.push({ ...block, lanes })
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }
  for (const w of windows) {
    if (cluster.length > 0 && w.startMin >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= w.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(w.endMin)
    } else laneEnds[lane] = w.endMin
    cluster.push({ ...w, lane })
    clusterEnd = Math.max(clusterEnd, w.endMin)
  }
  flush()
  return { allDay, timed }
}

/** The "now" line's offset in minutes since the grid's first hour, or null when it is off the grid. */
export function nowOffsetMin(nowMinutes: number): number | null {
  const floor = GRID_START_HOUR * 60
  const ceil = GRID_END_HOUR * 60
  return nowMinutes >= floor && nowMinutes <= ceil ? nowMinutes - floor : null
}

export function hourLabel(hour24: number): string {
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${h} ${hour24 < 12 ? 'AM' : 'PM'}`
}

export function timeRangeLabel(item: CalendarEvent): string {
  if (!item.endTimeLabel) return item.timeLabel
  return `${item.timeLabel} to ${item.endTimeLabel}`
}

// ─── THE TIMELINE ────────────────────────────────────────────────────────────────────────────────

/** Nine weeks from last Monday (the design). */
const TIMELINE_WEEKS = 9

interface TimelineMark {
  item: CalendarEvent
  /** 0 to 100, the centre of the item's day across the window. */
  leftPct: number
}

interface TimelineRow {
  key: string
  title: string
  /** The Plan this row stands for, or null for a row of items that belong to none. */
  planId: string | null
  stage: SpacePlan['stage'] | null
  /** The span of the row's dates inside the window, as percentages of its width. */
  spanLeftPct: number
  spanWidthPct: number
  /** Dated items that are not to-dos. */
  dates: TimelineMark[]
  /** To-dos as dots; `overdue` is true when the day has passed. */
  todos: (TimelineMark & { overdue: boolean })[]
}

interface TimelineWindow {
  startDay: string
  days: number
  weekTicks: { dayKey: string; leftPct: number }[]
  todayPct: number | null
  rows: TimelineRow[]
}

const LOOSE_TODOS_KEY = 'loose-todos'

export function timelineWindow(
  items: readonly CalendarEvent[],
  plans: readonly Pick<SpacePlan, 'id' | 'title' | 'stage'>[],
  anchorDay: string,
  todayDay: string,
  hidden: ReadonlySet<CalendarLayerKey> = new Set(),
): TimelineWindow {
  const startDay = addDays(weekStart(anchorDay), -7)
  const days = TIMELINE_WEEKS * 7
  const endDay = addDays(startDay, days - 1)
  const pct = (dayKey: string) => ((daysBetween(startDay, dayKey) + 0.5) / days) * 100
  const planById = new Map(plans.map((p) => [p.id, p]))

  const rows = new Map<string, TimelineRow>()
  const rowFor = (item: CalendarEvent): TimelineRow => {
    const plan = item.planId ? planById.get(item.planId) : undefined
    const isTodo = item.layer === 'todos'
    const key = plan ? `plan-${plan.id}` : isTodo ? LOOSE_TODOS_KEY : `item-${item.slug}`
    let row = rows.get(key)
    if (!row) {
      row = {
        key,
        title: plan ? plan.title : isTodo ? 'To-dos without a Plan' : item.title,
        planId: plan ? plan.id : null,
        stage: plan ? plan.stage : null,
        spanLeftPct: 0,
        spanWidthPct: 0,
        dates: [],
        todos: [],
      }
      rows.set(key, row)
    }
    return row
  }

  const bounds = new Map<string, { min: number; max: number }>()
  for (const item of items) {
    if (hidden.has(item.layer ?? 'events')) continue
    const itemEnd = item.endDayKey || item.dayKey
    if (itemEnd < startDay || item.dayKey > endDay) continue
    const row = rowFor(item)
    const leftPct = pct(item.dayKey < startDay ? startDay : item.dayKey)
    if (item.layer === 'todos') row.todos.push({ item, leftPct, overdue: item.dayKey < todayDay })
    else row.dates.push({ item, leftPct })
    const b = bounds.get(row.key) ?? { min: leftPct, max: leftPct }
    b.min = Math.min(b.min, leftPct)
    b.max = Math.max(b.max, itemEnd > endDay ? pct(endDay) : pct(itemEnd))
    bounds.set(row.key, b)
  }

  const out = [...rows.values()]
  for (const row of out) {
    const b = bounds.get(row.key)!
    row.spanLeftPct = b.min
    row.spanWidthPct = Math.max(b.max - b.min, 0)
    row.dates.sort((a, b2) => a.item.dayKey.localeCompare(b2.item.dayKey))
  }
  // Plans first, by when they begin; the loose to-dos row sits last.
  out.sort((a, b) => {
    if (a.key === LOOSE_TODOS_KEY) return 1
    if (b.key === LOOSE_TODOS_KEY) return -1
    return a.spanLeftPct - b.spanLeftPct || a.title.localeCompare(b.title)
  })

  return {
    startDay,
    days,
    weekTicks: Array.from({ length: TIMELINE_WEEKS }, (_, w) => ({
      dayKey: addDays(startDay, w * 7),
      leftPct: ((w * 7) / days) * 100,
    })),
    todayPct: todayDay >= startDay && todayDay <= endDay ? pct(todayDay) : null,
    rows: out,
  }
}
