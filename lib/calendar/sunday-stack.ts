import type { CalendarEvent } from './item'

// SUNDAY STACK (ADR-1386 P4). Back-to-back items on one day render as one block with segments,
// instead of three chips that each truncate. Pure grouping over a day's items.

export interface StackedDay {
  dayKey: string
  items: CalendarEvent[]
  stacked: boolean
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

export function stackDay(items: readonly CalendarEvent[]): StackedDay[] {
  const byDay = new Map<string, CalendarEvent[]>()
  for (const item of items) {
    const list = byDay.get(item.dayKey) ?? []
    list.push(item)
    byDay.set(item.dayKey, list)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayItems]) => ({
      dayKey,
      items: dayItems,
      stacked: dayItems.length > 1,
    }))
}
