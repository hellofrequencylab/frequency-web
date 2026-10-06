// THE LAUNCH NORTH STAR (LIVE-809, ADR-1720): weekly showing-up Members, the distinct people a Host
// marked present at a gathering in the last 7 days. It replaces Weekly Active Members (ADR-024) as
// the number the launch steers by. Never time in app.
//
// THE SOURCE IS THE HOST'S MARK. A seat counts when `attended_at` falls in the window AND
// `attended_by` names someone other than the person in the seat: the host's observation, written by
// lib/events/attendance.ts on event_rsvps and event_tickets. The self check-in and the "Did you make
// it?" yes (LIVE-803) are self-reported and live in the engagement ledger, so they never count here.
//
// Members are distinct profiles. Guests with no account are counted apart, by their lowercased email,
// so a guest who comes twice is one person and the Member figure stays a Member figure.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const SHOWING_UP_WINDOW_DAYS = 7
const WEEK_MS = SHOWING_UP_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** One host-marked seat, from either seat table. */
export interface AttendedSeat {
  profileId: string | null
  guestEmail: string | null
  attendedAt: string
  attendedBy: string | null
}

export interface ShowingUpReading {
  /** Distinct Members a Host marked present in the window. THE north star. */
  members: number
  /** Distinct guests (no account) a Host marked present in the window. */
  guests: number
  /** The window's start and end, ISO. */
  since: string
  until: string
}

/** Pure: count distinct host-marked people in [since, until). Exported for the test. */
export function countShowingUp(seats: AttendedSeat[], since: Date, until: Date): Omit<ShowingUpReading, 'since' | 'until'> {
  const members = new Set<string>()
  const guests = new Set<string>()
  for (const s of seats) {
    const at = Date.parse(s.attendedAt)
    if (!Number.isFinite(at) || at < since.getTime() || at >= until.getTime()) continue
    // A host's mark only: a seat marked by its own holder is a self check-in, not a showing-up.
    if (!s.attendedBy || s.attendedBy === s.profileId) continue
    if (s.profileId) members.add(s.profileId)
    else if (s.guestEmail) guests.add(s.guestEmail.trim().toLowerCase())
  }
  return { members: members.size, guests: guests.size }
}

/**
 * The reading for the 7 days ending at `until` (default now). Read-only, service role, because the
 * marks span every event. Fail-soft to null so an admin page shows "no reading" rather than a 500.
 */
export async function getShowingUpReading(until: Date = new Date()): Promise<ShowingUpReading | null> {
  const since = new Date(until.getTime() - WEEK_MS)
  try {
    const db = createAdminClient()
    const [rsvps, tickets] = await Promise.all([
      db
        .from('event_rsvps')
        .select('profile_id, guest_email, attended_at, attended_by')
        .gte('attended_at', since.toISOString())
        .lt('attended_at', until.toISOString())
        .not('attended_by', 'is', null),
      db
        .from('event_tickets')
        .select('buyer_profile_id, guest_email, attended_at, attended_by')
        .gte('attended_at', since.toISOString())
        .lt('attended_at', until.toISOString())
        .not('attended_by', 'is', null),
    ])
    if (rsvps.error || tickets.error) {
      console.error('[showing-up] read failed', rsvps.error ?? tickets.error)
      return null
    }
    const seats: AttendedSeat[] = [
      ...(rsvps.data ?? []).map((r) => ({
        profileId: r.profile_id,
        guestEmail: r.guest_email,
        attendedAt: r.attended_at ?? '',
        attendedBy: r.attended_by,
      })),
      ...(tickets.data ?? []).map((t) => ({
        profileId: t.buyer_profile_id,
        guestEmail: t.guest_email,
        attendedAt: t.attended_at ?? '',
        attendedBy: t.attended_by,
      })),
    ]
    return { ...countShowingUp(seats, since, until), since: since.toISOString(), until: until.toISOString() }
  } catch (err) {
    console.error('[showing-up] read threw', err)
    return null
  }
}
