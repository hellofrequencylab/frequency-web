// The RSVP gate (ADR-1174, ADR-1175), shared by every member path that takes a seat: the
// toggle / status / plus-one actions in app/(main)/events/actions.ts and the depth sheet in
// app/(main)/events/[slug]/social-actions.ts. SCAN-697: it used to be private to actions.ts, so
// the depth sheet wrote a going row with any number of plus-ones into a cancelled, finished or
// closed event. One module, one answer.

import { createAdminClient } from '@/lib/supabase/admin'
import { isEventPast, resolveZone } from '@/lib/time/zone'
import { rsvpWindowStateFromDetails } from '@/lib/events/rsvp-window'

// Capacity-neutral headcount the host cares about: how many guests a confirmed attendee is
// bringing. Clamped to [0, MAX_PLUS_ONES] on every path that writes it.
export const MAX_PLUS_ONES = 5

/**
 * The two answers a caller needs. `open` is the hard gate — a cancelled or finished event takes
 * nothing at all. `windowOpen` gates JOINING only: a host's booking window stops new answers, it
 * does not trap the people who already answered. Somebody who said yes must always be able to say
 * no, or "close RSVPs" quietly becomes "lock the guest list", which is a different feature and one
 * nobody asked for.
 */
export interface RsvpGate { open: boolean; windowOpen: boolean }
export const CLOSED_FOR_RSVP: RsvpGate = { open: false, windowOpen: false }

export async function eventOpenForRsvp(eventId: string): Promise<RsvpGate> {
  const admin = createAdminClient()
  // `details` and `time_zone` sit outside the generated types, so this reads untyped and casts
  // (repo convention, ADR-246). Both are returned at runtime.
  const { data } = await admin
    .from('events')
    .select('id, is_cancelled, starts_at, ends_at, time_zone, details')
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as unknown as {
    id: string
    is_cancelled: boolean | null
    starts_at: string
    ends_at: string | null
    time_zone: string | null
    details: unknown
  } | null
  if (!ev || ev.is_cancelled) return CLOSED_FOR_RSVP

  const zone = resolveZone(ev.time_zone)
  // Once the gathering is OVER there is nothing left to say you are coming to. The page has hidden
  // the controls past this point since #2319; the action never enforced it, so a stale tab or a
  // direct call still minted a seat for last month's event.
  if (isEventPast(ev.starts_at, ev.ends_at, zone)) return CLOSED_FOR_RSVP

  // The host's booking window (lib/events/rsvp-window.ts). Enforced HERE and not only in the page,
  // because a control that merely hides a button is not a window (ADR-1174).
  return { open: true, windowOpen: rsvpWindowStateFromDetails(ev.details, zone) === 'open' }
}
