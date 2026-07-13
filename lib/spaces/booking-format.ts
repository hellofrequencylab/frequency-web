// PURE booking display helpers (no server / Supabase / next imports), so BOTH the server surface
// (booking-member) AND the client service picker (booking-service-member) can group + label slots
// from the one source without dragging server-only code into the client bundle. Slot instants are
// absolute UTC; every label here is computed in a caller-supplied timezone (the Space tz, or in P2
// the invitee's browser tz). No em / en dashes in any copy (CONTENT-VOICE §10).

import type { OpenSlot } from '@/lib/spaces/booking'

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
