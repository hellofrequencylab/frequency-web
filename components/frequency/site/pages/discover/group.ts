// THE CALENDAR, GROUPED. The DAWN discover pages print every upcoming event as one long column of rows
// (sixty on /discover/events). The design's "What's happening" reads as date-chip cards in a few honest
// buckets instead: this week, next week, then one bucket per month. A long list shows its first rows and
// folds the rest behind a native <details>, so the whole calendar stays in the static HTML (crawlers,
// JSON-LD and no-JS readers see every event) without a sixty-card wall.
//
// Pure and request-free: `today` is passed in (the caller reads dayInZone(new Date(), HOME_TZ) at render,
// as every discover read already does), so the routes keep their ISR revalidate.

/** The one field grouping needs. `starts_at` stores the host's wall clock as UTC parts (lib/utils), so its
 *  first ten characters ARE the local calendar day. */
export interface Dated {
  starts_at: string
}

export interface EventGroup<T extends Dated> {
  /** Stable key for React and for in-page anchors. */
  key: string
  /** "This week", "Next week", "November". */
  label: string
  events: T[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Add `days` to a YYYY-MM-DD day string, staying in calendar days. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Bucket events (already in start order) into This week / Next week / one bucket per month after that.
 *  An event dated before `today` (a series fold can keep tonight's gathering after midnight UTC) reads as
 *  this week rather than vanishing. Order inside a bucket is the input order. */
export function groupByWhen<T extends Dated>(events: readonly T[], today: string): EventGroup<T>[] {
  const weekEnd = addDays(today, 7)
  const nextEnd = addDays(today, 14)
  const groups: EventGroup<T>[] = []
  const byKey = new Map<string, EventGroup<T>>()
  for (const e of events) {
    const day = e.starts_at.slice(0, 10)
    let key: string
    let label: string
    if (day < weekEnd) {
      key = 'this-week'
      label = 'This week'
    } else if (day < nextEnd) {
      key = 'next-week'
      label = 'Next week'
    } else {
      key = day.slice(0, 7)
      const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? day.slice(0, 7)
      label = day.slice(0, 4) === today.slice(0, 4) ? month : `${month} ${day.slice(0, 4)}`
    }
    let g = byKey.get(key)
    if (!g) {
      g = { key, label, events: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.events.push(e)
  }
  return groups
}

/** Split grouped events at `limit` rows: what shows, and what folds. A bucket cut in two keeps its label on
 *  both sides, so the folded half still says which week or month it belongs to. */
export function splitAt<T extends Dated>(
  groups: readonly EventGroup<T>[],
  limit: number,
): { shown: EventGroup<T>[]; folded: EventGroup<T>[]; foldedCount: number } {
  const shown: EventGroup<T>[] = []
  const folded: EventGroup<T>[] = []
  let left = Math.max(0, limit)
  let foldedCount = 0
  for (const g of groups) {
    if (left >= g.events.length) {
      shown.push(g)
      left -= g.events.length
      continue
    }
    if (left > 0) shown.push({ ...g, events: g.events.slice(0, left) })
    const rest = g.events.slice(left)
    folded.push({ ...g, key: `${g.key}-more`, events: rest })
    foldedCount += rest.length
    left = 0
  }
  return { shown, folded, foldedCount }
}

/** Past events (newest first) bucketed by month only: "This week" means nothing looking back. */
export function groupByMonth<T extends Dated>(events: readonly T[], today: string): EventGroup<T>[] {
  const groups: EventGroup<T>[] = []
  const byKey = new Map<string, EventGroup<T>>()
  for (const e of events) {
    const day = e.starts_at.slice(0, 10)
    const key = day.slice(0, 7)
    const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? key
    const label = day.slice(0, 4) === today.slice(0, 4) ? month : `${month} ${day.slice(0, 4)}`
    let g = byKey.get(key)
    if (!g) {
      g = { key, label, events: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.events.push(e)
  }
  return groups
}
