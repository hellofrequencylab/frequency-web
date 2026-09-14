'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { rateLimitOk } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { promoteFromWaitlist } from '@/lib/events/capacity'
import { notifyPromotedSeat } from '@/lib/events/waitlist-notify'
import { isSeatToken, MAX_GUEST_PLUS_ONES } from '@/lib/events/guest-seat'

// THE GUEST'S SEAT, THE TWO THINGS THEY CAN DO WITH IT (PROG-GD2).
//
// A signed-out guest reaches this from the one link in their receipt (lib/events/guest-seat.ts).
// The page rendered their seat on GET and did nothing; these are the submits it waits for. Both
// are the member path's twin (setRsvpStatus and setRsvpPlusOnes in app/(main)/events/actions.ts)
// rather than a copy of it: the seat row is the same row, the capacity trigger is the same
// trigger, and a release runs the SAME promoteFromWaitlist + notifyPromotedSeat pair a member's
// "Can't go" runs, so the next person in line moves in and hears about it whichever identity holds
// their seat.
//
// ── WHERE THE AUTHORITY LIVES, AND WHY IT IS NOT HERE ────────────────────────────────────────────
// Everything that decides anything happens inside update_guest_seat and release_guest_seat
// (20270345004200), SECURITY DEFINER functions granted to anon. That grant is the point: they are
// reachable over PostgREST directly, so this file is a convenience wrapper and NOT a security
// boundary. The SQL hashes the token, checks the event is still live, refuses a member or claimed
// row, clamps plus-ones under the member rule and keys every answer to the seat. It is called
// through the SESSION client for the same reason the guest RSVP action is: the admin client would
// bypass RLS and make the function's own guards the only ones left. Keeping this file off the
// admin client keeps it off scripts/admin-client-baseline.txt.
//
// ── THE REPLY ────────────────────────────────────────────────────────────────────────────────────
// A token that addresses nothing (wrong, expired, released, claimed) gets the same plain "this
// link is not active" whichever it was. That is not an oracle on any person: the token is 122
// bits of randomness and the only thing it can address is the seat it was minted for.

export type GuestSeatActionResult = { ok: true } | { ok: false; error: string }

/** The reply when the token no longer opens anything. Same words on every dead path. */
const NOT_ACTIVE: GuestSeatActionResult = {
  ok: false,
  error: 'This link is not active. If you still hold a spot, the newest email about this event has a working one.',
}

/** The reply when the write itself did not happen. Plain, and about us rather than the reader. */
const WRITE_FAILED: GuestSeatActionResult = { ok: false, error: 'We could not save that. Please try again.' }

const RATE_LIMITED: GuestSeatActionResult = {
  ok: false,
  error: 'Too many requests. Please try again in a few minutes.',
}

/** Answers arrive as a plain object keyed by question id; the SQL drops anything that is not one
 *  of this event's questions, so this only bounds the shape and the size. */
function cleanAnswers(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  let n = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    if (n++ >= 50) break
    out[k] = v.slice(0, 2000)
  }
  return out
}

async function throttled(key: string): Promise<boolean> {
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  // FAILS CLOSED in production when Upstash is unconfigured (lib/rate-limit.ts), the right way
  // round for an open door that moves a seat.
  return !(await rateLimitOk(key, ip, 20, '10 m'))
}

// authz-ok: anonymous by design (the header above). The token IS the capability, and every write
// goes through the SESSION client into update_guest_seat, a SECURITY DEFINER function granted to
// anon that verifies the token's hash and clamps every field itself.
export async function updateGuestSeat(input: {
  token: string
  slug: string
  plusOnes?: number | null
  answers?: Record<string, string> | null
}): Promise<GuestSeatActionResult> {
  if (!isSeatToken(input.token)) return NOT_ACTIVE
  if (await throttled('event_guest_seat_update')) return RATE_LIMITED

  const plusOnes =
    typeof input.plusOnes === 'number' && Number.isFinite(input.plusOnes)
      ? Math.max(0, Math.min(MAX_GUEST_PLUS_ONES, Math.trunc(input.plusOnes)))
      : null

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('update_guest_seat', {
      p_token: input.token,
      ...(plusOnes === null ? {} : { p_plus_ones: plusOnes }),
      ...(input.answers ? { p_answers: cleanAnswers(input.answers) } : {}),
    })
    if (error) {
      console.error('[guest seat] update_guest_seat failed', { error: error.message })
      return WRITE_FAILED
    }
    if (data !== true) return NOT_ACTIVE
  } catch (e) {
    console.error('[guest seat] update_guest_seat threw', { error: e instanceof Error ? e.message : String(e) })
    return WRITE_FAILED
  }

  if (input.slug) revalidatePath(`/events/${input.slug}`)
  return { ok: true }
}

// authz-ok: anonymous by design (the header above). The token IS the capability; the write goes
// through the SESSION client into release_guest_seat, a SECURITY DEFINER function granted to anon
// that verifies the token's hash, and the promotion that follows is the shared member mechanism.
export async function releaseGuestSeat(input: {
  token: string
  slug: string
}): Promise<GuestSeatActionResult> {
  if (!isSeatToken(input.token)) return NOT_ACTIVE
  if (await throttled('event_guest_seat_release')) return RATE_LIMITED

  let eventId: string | null = null
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('release_guest_seat', { p_token: input.token })
    if (error) {
      console.error('[guest seat] release_guest_seat failed', { error: error.message })
      return WRITE_FAILED
    }
    eventId = typeof data === 'string' && data ? data : null
  } catch (e) {
    console.error('[guest seat] release_guest_seat threw', { error: e instanceof Error ? e.message : String(e) })
    return WRITE_FAILED
  }
  // Nothing changed: the token addressed no live seat. The words are the same as every other
  // dead path, and no promotion runs on top of a seat that was never freed.
  if (!eventId) return NOT_ACTIVE

  // The seat is free from the statement above (the trigger counts 'going' rows). Pull the next
  // person off the waitlist and TELL them, through the exact pair the member's "Can't go" uses.
  // promoteFromWaitlist re-checks capacity itself, so a released waitlist hold moves nobody.
  const promoted = await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
  if (promoted) await notifyPromotedSeat(promoted, eventId).catch((e) => console.error('[events waitlist notify]', e))

  if (input.slug) revalidatePath(`/events/${input.slug}`)
  return { ok: true }
}
