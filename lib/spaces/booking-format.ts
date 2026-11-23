// PURE booking display helpers (no server / Supabase / next imports), so BOTH the server surface
// (booking-member) AND the client service picker (booking-service-member) can group + label slots
// from the one source without dragging server-only code into the client bundle. Slot instants are
// absolute UTC; every label here is computed in a caller-supplied timezone (the Space tz, or in P2
// the invitee's browser tz). No em / en dashes in any copy (CONTENT-VOICE §10).

import type { OpenSlot, ServiceLocation } from '@/lib/spaces/booking'

/** A day group of open slots (the local calendar date label + its slots). */
export interface SlotDay {
  /** A stable key (the local YYYY-MM-DD in `timezone`). */
  key: string
  /** The day label, e.g. "Tuesday, June 23". */
  label: string
  slots: OpenSlot[]
}

/** Group open slots by their local calendar day in `timezone`, preserving ascending order. */
export function groupSlotsByDay(slots: OpenSlot[], timezone: string): SlotDay[] {
  const dayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const groups = new Map<string, SlotDay>()
  for (const slot of slots) {
    const d = new Date(slot.startsAt)
    const key = dayKey.format(d)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: dayLabel.format(d), slots: [] }
      groups.set(key, group)
    }
    group.slots.push(slot)
  }
  return [...groups.values()]
}

/** A plain-language session-length label derived from the open slots' durations (no IO). One length
 *  reads "30 minute sessions"; mixed lengths read "30 or 60 minute sessions". Null with no slots. */
export function sessionLengthLabel(slots: OpenSlot[]): string | null {
  const lengths = [...new Set(slots.map((s) => s.slotMinutes))].sort((a, b) => a - b)
  if (lengths.length === 0) return null
  const list =
    lengths.length === 1
      ? String(lengths[0])
      : `${lengths.slice(0, -1).join(', ')} or ${lengths[lengths.length - 1]}`
  return `${list} minute sessions`
}

/** A short, friendly timezone label, e.g. "EDT" or the IANA name if no short form. */
export function timezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

/** A plain-language duration label for a service, e.g. "30 min" (member-facing, no em/en dashes). */
export function durationLabel(minutes: number): string {
  return `${minutes} min`
}

/** BOOK-010: where a service happens, for the booking page. A video link is not shown before booking:
 *  it goes out in the confirmation, as Calendly does. */
export function whereLabel(location: ServiceLocation): string {
  if (location.kind === 'video') return 'Video call. The link comes with your confirmation.'
  if (location.kind === 'phone') return `Phone call: ${location.value}`
  return location.value
}

/** The months (YYYY-MM, ascending) the open days fall in, from the first open month to the last, with
 *  any empty month between kept so month-to-month paging never skips one. The slots already stop at the
 *  booking window, so this range IS the window as the month grid pages it. Day keys are local dates. */
export function openMonthRange(days: SlotDay[]): string[] {
  if (days.length === 0) return []
  const keys = days.map((d) => d.key).sort()
  const [fy, fm] = keys[0].split('-').map(Number)
  const [ly, lm] = keys[keys.length - 1].split('-').map(Number)
  const months: string[] = []
  for (let i = fy * 12 + fm - 1; i <= ly * 12 + lm - 1; i++) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`)
  }
  return months
}

/** The weeks of one month (YYYY-MM) as a calendar grid, Sunday first: each cell is that day's local
 *  YYYY-MM-DD key, or null for the padding before the 1st and after the last day. Pure date arithmetic
 *  on the calendar date, so it never depends on the machine's timezone. */
export function monthWeeks(monthKey: string): (string | null)[][] {
  const [y, m] = monthKey.split('-').map(Number)
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= length; d++) cells.push(`${monthKey}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
