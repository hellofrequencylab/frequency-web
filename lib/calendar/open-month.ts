// WHICH MONTH A CALENDAR OPENS ON. One answer for every calendar mount, so no page picks its own.
//
// The rule: a month named in the link (`?y=2026&m=11`) wins; otherwise it is the CURRENT month in the
// zone given, whatever the first or the most events are. A calendar that opened on the month of its
// next event would show a Space with a quiet October as November, and the viewer would never know
// October was empty. The server cannot know the viewer's own zone, so a mount that is not pinned is
// corrected in the browser (components/events/event-calendar.tsx).
import { dayInZone } from '@/lib/time/zone'
import { safeMonth } from '@/lib/calendar/month-window'

interface OpeningMonth {
  year: number
  month1: number
  /** True when the link named the month, so nothing downstream may move it. */
  pinned: boolean
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function openingMonth(
  now: Date,
  timeZone?: string | null,
  query?: { y?: string | string[]; m?: string | string[] },
): OpeningMonth {
  const named = query ? safeMonth(first(query.y), first(query.m)) : null
  if (named && first(query?.y) && first(query?.m)) return { ...named, pinned: true }
  const day = dayInZone(now, timeZone)
  return { year: Number(day.slice(0, 4)), month1: Number(day.slice(5, 7)), pinned: false }
}
