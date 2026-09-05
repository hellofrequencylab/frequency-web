'use server'

import { headers } from 'next/headers'
import { rateLimitOk } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { sendGuestRsvpReceipt } from '@/lib/events/guest-rsvp-email'

// SIGNED-OUT GUEST RSVP — one field, and a seat that obeys the member rules.
//
// The event page's signed-out branch used to be a link to /sign-in. Someone followed a shared link,
// wanted to say they were coming, and was asked to make an account first. This is the other door.
//
// ── WHERE THE AUTHORITY LIVES, AND WHY IT IS NOT HERE ────────────────────────────────────────────
// Everything that decides anything happens inside `capture_guest_rsvp` (20270303000100), a SECURITY
// DEFINER function granted to `anon`. That grant is the point: the function is reachable over
// PostgREST directly, so this action is a convenience wrapper and NOT a security boundary. Nothing
// below may be the only thing standing between a caller and a bad outcome, because a caller can
// simply not use it. The SQL re-validates the address, re-checks that the event is real, public,
// future, un-cancelled and not ticketed, and bounds every field.
//
// It is called through the SESSION client rather than the admin client for the same reason: the
// admin client would bypass RLS and make the function's own guards the only ones left. Keeping this
// file off the admin client also keeps it off scripts/admin-client-baseline.txt.
//
// ── THE RESPONSE IS ALWAYS THE SAME ──────────────────────────────────────────────────────────────
// A seat is scoped to a NAMED, PUBLIC event, so the question an attacker asks is not "does this
// address exist" but "is this person going to this event". Every validly-formed submission gets the
// identical reply: we do not say whether the event was real, whether a seat was taken, whether the
// room was full and they were waitlisted, or whether that address had already RSVP'd. The only
// non-success replies are a malformed address (their own input, echoed back) and a rate limit.
//
// The capture function is built to match: it returns a FRESH random uuid on every path except a
// malformed address, so even a direct PostgREST caller reading the raw return value learns nothing.
//
// ── THE ONE EXCEPTION: A WRITE THAT DID NOT HAPPEN (meta-scan L5-14) ─────────────────────────────
// "Identical reply" covers every outcome the FUNCTION decides. It never covered the function not
// running at all: PostgREST down, a network fault, a malformed event id. Those used to be swallowed
// into the same success, so a guest read "Check your email" while no seat existed, no email was
// sent, and the host never saw them. That is not anti-enumeration, it is a lie with a good alibi.
// The `error` half of the RPC reply (never the `data` half, which is the receipt) is now read, and
// an error renders the form's existing error line and skips the receipt email. An infrastructure
// failure says nothing about any person, so the oracle stays closed.

export type GuestRsvpResult = { ok: true } | { ok: false; error: string }

/**
 * The untyped RPC surface (ADR-246). `capture_guest_rsvp` is live but not in the generated
 * lib/database.types.ts, and `rpc()` is typed from that same generated file, so the cast stays until
 * the types are refreshed AND every caller is retyped in one pass. Identical to the handle
 * app/join/(induction)/lead-actions.ts uses for capture_signup_lead, which is this function's sibling.
 */
type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The reply every good-faith submission gets, whatever actually happened underneath. */
const GENERIC_OK: GuestRsvpResult = { ok: true }

/** The reply when the write itself did not happen. Plain, and about us rather than the reader. */
const WRITE_FAILED: GuestRsvpResult = { ok: false, error: 'We could not save your spot. Please try again.' }

export async function submitGuestRsvp(input: {
  eventId: string
  email: string
  name?: string
  /** Honeypot. A real person never sees this field, so anything in it is a bot. */
  company?: string
}): Promise<GuestRsvpResult> {
  // Silent success for the honeypot: telling a bot it was caught only teaches it to stop filling
  // the field. Same idiom as app/(capture)/checkin/actions.ts.
  if ((input.company || '').trim() !== '') return GENERIC_OK

  const email = (input.email || '').trim().toLowerCase()
  const name = (input.name || '').trim() || null

  // Throttle this open, unauthenticated endpoint per IP. FAILS CLOSED in production when Upstash is
  // unconfigured (lib/rate-limit.ts), which is the correct direction for a door that consumes a seat.
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('event_guest_rsvp', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many requests. Please try again in a few minutes.' }
  }

  // UX validation only. The SQL checks this again and is the one that counts; this exists so a typo
  // gets a useful message instead of a shrug. Echoing back the reader's own input leaks nothing.
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' }

  try {
    const supabase = await createClient()
    // The RECEIPT (`data`) is deliberately DISCARDED. It is an opaque receipt by construction, and
    // branching on it — even to decide a message — is how an anti-enumeration property gets lost
    // one helpful improvement at a time. `error` is a different thing: it means the function did
    // not run, so there is no seat to be quiet about.
    const { error } = await (supabase as unknown as UntypedRpc).rpc('capture_guest_rsvp', {
      p_event_id: input.eventId,
      p_email: email,
      p_name: name,
    })
    if (error) {
      console.error('[guest-rsvp] capture_guest_rsvp failed', { eventId: input.eventId, error: error.message })
      return WRITE_FAILED
    }
  } catch (e) {
    // A thrown RPC (network, PostgREST unreachable) is the same non-write as an `error` reply: the
    // seat does not exist, so the reader must not be told to check their email for it.
    console.error('[guest-rsvp] capture_guest_rsvp threw', { eventId: input.eventId, error: e instanceof Error ? e.message : String(e) })
    return WRITE_FAILED
  }

  try {
    // The receipt. Awaited rather than floated because a server action's process can be torn down
    // the moment it returns, and a dropped promise here means a guest who submitted a form and
    // heard nothing at all — this email is the ONLY record they have. It cannot change the reply:
    // it resolves on every path and swallows its own failures.
    //
    // It decides for itself whether to send, by re-reading the seat with an admin client (a guest
    // cannot see their own row under RLS). That read lives in lib/events/guest-rsvp-email.ts and
    // not here on purpose — this file stays on the session client so it holds no power the SQL is
    // not already assuming, since the capture function is granted to anon and reachable directly.
    //
    // Known and accepted: awaiting makes a real, seatable event a few database reads slower than a
    // bogus event id, which is a weak timing signal about the EVENT (not about any person). It is
    // the same class as the publicly-rendered `spotsLeft` counter the migration already accepts,
    // and it is bounded by an outbox insert rather than an SMTP round trip.
    await sendGuestRsvpReceipt(input.eventId, email)
  } catch {
    // Swallowed on purpose. A thrown RPC (network, PostgREST, a bad event id shaped like a uuid)
    // must not produce a different reply from a successful one, or the error itself becomes the
    // oracle the function was written to avoid.
    // (This block now guards only the receipt email: the seat is already written by the time it
    // runs, so "we could not save your spot" would be false here. The capture RPC's own failure is
    // handled above, where it IS a non-write.)
  }

  return GENERIC_OK
}
