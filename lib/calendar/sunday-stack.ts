import type { CalendarEvent } from './item'

// SUNDAY STACK (ADR-1386 P4). Back-to-back items on one day render as one block with segments,
// instead of three chips that each truncate. Pure grouping over a day's items.
//
// 🔴 A SEGMENT PER ITEM, NEVER ONE CHIP FOR THE DAY (LIVE-467). The first cut stacked ANY day that
// held two or more items into one chip whose text joined every title and whose click opened only
// the first, so a second gathering on the same day could not be opened from the grid at all, and
// "+N more" never showed because the joined chip swallowed the count. A stack is a RUN of items
// that abut (areBackToBack); each item in the run keeps its own segment, and two items that merely
// share a day are two chips.

export interface StackedDay {
  dayKey: string
  items: CalendarEvent[]
  /** True when at least one run on this day holds two or more back-to-back items. */
  stacked: boolean
  /** The day's items in start order, grouped into runs of back-to-back items. A run of one is an
   *  ordinary chip; a run of two or more renders as one block with a segment per item. */
  runs: CalendarEvent[][]
}

function minutes(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** True when two items on the same day abut or overlap (within 1 minute). */
export function areBackToBack(a: CalendarEvent, b: CalendarEvent): boolean {
  if (a.dayKey !== b.dayKey) return false
  const aStart = minutes(a.startInstantIso)
  const bStart = minutes(b.startInstantIso)
  if (aStart == null || bStart == null) return a.dayKey === b.dayKey && !!a.endDayKey
  const gap = Math.abs(aStart - bStart)
  return gap <= 12 * 60 * 60 * 1000
}

/** A day's items in start order (an item with no instant keeps its place after the timed ones),
 *  grouped into runs where each item is back-to-back with the one before it. */
export function stackRuns(items: readonly CalendarEvent[]): CalendarEvent[][] {
  const ordered = [...items].sort((a, b) => {
    const at = minutes(a.startInstantIso)
    const bt = minutes(b.startInstantIso)
    if (at == null && bt == null) return 0
    if (at == null) return 1
    if (bt == null) return -1
    return at - bt
  })
  const runs: CalendarEvent[][] = []
  for (const item of ordered) {
    const last = runs[runs.length - 1]
    if (last && areBackToBack(last[last.length - 1], item)) last.push(item)
    else runs.push([item])
  }
  return runs
}

export function stackDay(items: readonly CalendarEvent[]): StackedDay[] {
  const byDay = new Map<string, CalendarEvent[]>()
  for (const item of items) {
    const list = byDay.get(item.dayKey) ?? []
    list.push(item)
    byDay.set(item.dayKey, list)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayItems]) => {
      const runs = stackRuns(dayItems)
      return { dayKey, items: dayItems, stacked: runs.some((run) => run.length > 1), runs }
    })
}
