import 'server-only'

import { eventInstant, resolveZone } from '@/lib/time/zone'

// CLAIM-ON-SIGN-IN — the leg of the guest seat that onboarding could never cover.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────────────────────────
// A guest seat (event_rsvps with profile_id NULL and guest_email set, 20270303000000) is invisible
// to every number the platform is steered by. WAM counts DISTINCT actor_profile_id over
// `practice.verified` in a rolling 7 days (lib/analytics/practice.ts) and the host's "checked in"
// count reads the same ledger keyed on (event, profile) (events/[slug]/manage/load.ts). Neither can
// see a row that has no profile. So there is no version of "let a guest check in without an account"
// that reaches WAM: the metric is DEFINED on profile ids, and a check-in with a null actor would be
// a ledger row that every reader filters back out. The only honest close is to turn the guest into a
// member first, and `claim_guest_rsvps` (20270303000100) is the door that does it.
//
// ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────────────────────────
// Until now that door had exactly ONE caller: completeOnboarding (app/onboarding/actions.ts). That
// covers a guest who signs up and finishes induction, and NOBODY ELSE. In particular it misses the
// most common guest of all: someone who ALREADY HAS AN ACCOUNT and was simply signed out when they
// hit the RSVP form. They never see onboarding again, so their seat stranded permanently — it held
// real capacity, never appeared in "my events", and could never be checked in, which is precisely
// the under-report the guest-seat work left open (ADR-1032 "Still open").
//
// Sign-in is the correct seam because it is the moment the two things the SQL demands become true
// at once: `auth.uid()` is the caller, and `auth.users.email_confirmed_at` has just been stamped by
// the link they clicked. Nothing here proves an address — Supabase's own magic link does, which is
// the whole point. A typed address still keys nothing (ADR-854); the RPC reads the PROVEN address
// out of auth.users server-side and never takes one as a parameter.
//
// ── EVERYTHING RUNS ON THE SESSION CLIENT, INCLUDING THE READS ───────────────────────────────────
// The RPC has no choice: `claim_guest_rsvps` proves ownership with `auth.uid()`, so under the
// service-role client it matches no profile and silently claims nothing. The READS could have taken
// the bypass and deliberately do not, because RLS already grants exactly what this module needs and
// nothing more (verified against the live policies, not assumed):
//
//   • event_rsvps SELECT — `profile_id = private.get_my_profile_id() OR (host of the event)`. By the
//     time the read-back runs, the claim has ALREADY set profile_id to this member, so the rows are
//     the caller's own. The policy is the correct authority here rather than an obstacle to route
//     around: it says a member may see their own seats, and their own seats are all this asks for.
//   • events SELECT — public/unlisted (plus host/poster/circle/space branches). A guest seat can
//     only exist on a public or unlisted event, because capture_guest_rsvp refuses anything else, so
//     the events behind a claimed seat are exactly the ones this policy already permits.
//
// The one row RLS would withhold is an event whose `status` is still 'draft' (the policy's draft
// branch is author-only). A draft cannot be RSVP'd to through any UI, and the consequence if one
// ever exists is the mildest possible: no landing, so the sign-in goes to its normal destination.
// The seat is still claimed either way, since the claim is the RPC and not these reads.
//
// Everything in this module is best-effort and swallowed by its caller: a claim is a bonus, never a
// blocker on authentication.

/**
 * The narrow structural handle this module needs from the SESSION-scoped Supabase client. Untyped
 * (ADR-246): `claim_guest_rsvps` and the `guest_claimed_by` / `guest_claimed_at` columns postdate
 * the generated types, so the caller casts once at the call site rather than fighting a stale
 * `Database` type at four chained call sites here.
 */
export type SessionClient = {
  /** supabase-js resolves `{ error }` and never throws, so the RPC's outcome is READ, not caught. */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error?: { message?: string } | null } | null | void>
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        gte: (col: string, val: unknown) => Promise<{ data: unknown }>
      }
      in: (col: string, vals: string[]) => Promise<{ data: unknown }>
    }
  }
}

/** A seat that just became this member's, with everything the landing decision needs. */
export interface ClaimedSeat {
  slug: string
  startsAt: string
  endsAt: string | null
  /** IANA zone the event's wall-clock is stored against; null falls back to the home zone. */
  timeZone: string | null
}

/** How far back a claim counts as "just now" for the landing decision. The RPC and this read happen
 *  milliseconds apart; a minute of slack absorbs a slow round trip without ever picking up a seat
 *  claimed on a previous sign-in. */
const JUST_CLAIMED_MS = 2 * 60 * 1000

/** An event with no end time is treated as running for this long after it starts. `isEventPast`
 *  answers "started" for a null `ends_at`, which is the right answer for unlocking check-in and the
 *  wrong one for "is this happening right now" — without a window every no-end-time event would be
 *  simultaneously started and over, and none would ever be landed on. */
const OPEN_ENDED_RUN_MS = 6 * 60 * 60 * 1000

/** Grace after the end instant. Check-in itself has no upper bound (checkInEvent only requires the
 *  event to have STARTED), and people commonly log it on the way out, so a short tail keeps the
 *  landing right for them without teleporting anyone into last week's gathering. */
const AFTER_END_GRACE_MS = 2 * 60 * 60 * 1000

/**
 * Where to send someone who just claimed one or more guest seats, or null for "nowhere in
 * particular, use the normal destination".
 *
 * Deliberately narrow: it fires ONLY for an event that is happening around now. Landing someone on
 * a gathering three weeks out because a seat attached would be a surprise redirect; landing them on
 * the one they are standing in the room for is the entire point of the round trip. Pure so the rule
 * is testable without a database.
 */
export function pickSeatLanding(seats: ClaimedSeat[], now: Date = new Date()): string | null {
  let best: { slug: string; startedAt: number } | null = null

  for (const seat of seats) {
    const tz = resolveZone(seat.timeZone)
    const start = eventInstant(seat.startsAt, tz)
    if (!start) continue
    const end = eventInstant(seat.endsAt, tz) ?? new Date(start.getTime() + OPEN_ENDED_RUN_MS)

    const startedAt = start.getTime()
    if (now.getTime() < startedAt) continue
    if (now.getTime() > end.getTime() + AFTER_END_GRACE_MS) continue

    // Most recently started wins when someone claims two live seats at once (a real case for
    // back-to-back gatherings): the later one is the room they are in now.
    if (!best || startedAt > best.startedAt) best = { slug: seat.slug, startedAt }
  }

  return best ? `/events/${best.slug}` : null
}

/**
 * Attach any guest seats held by this member's PROVEN address, and say where to land them.
 *
 * Returns the event path when the claim attached a seat to an event that is happening now, so the
 * caller can put them on the page where the Check in button is. Returns null otherwise, including on
 * every failure — a stranded landing is a redirect nobody notices, and a thrown error here would
 * fail a login.
 *
 * @param session the SESSION-scoped Supabase client (see SessionClient — every call here, the RPC
 *                and both reads, is authorized as this member; the service-role client would claim
 *                nothing, because the RPC's whole mechanism is `auth.uid()`)
 * @param profileId the signed-in member's profile id
 */
export async function claimGuestSeatsOnSignIn(
  session: SessionClient,
  profileId: string,
): Promise<string | null> {
  // Swallowed on purpose: the RPC is void and fail-closed by design (a caller who does not own the
  // profile, or whose address is unconfirmed, gets a silent no-op rather than an error).
  //
  // 2026-09-05 (scan2 L5-19): the sentence above described a try/catch that could never enter its
  // catch. supabase-js resolves `{ error }` and does not throw, so a refused or failed RPC (a
  // permission denial, a missing function after a migration drift, a transport error) arrived here
  // as a resolved value and the reads below then reported "nothing to claim" with no trace. The
  // outcome is now READ. The behaviour is unchanged on purpose: still a fail-closed no-op, still
  // never a blocker on sign-in, but a failure is logged so it can be seen.
  const rpcResult = await session.rpc('claim_guest_rsvps', { p_profile_id: profileId })
  const rpcError = rpcResult && typeof rpcResult === 'object' && 'error' in rpcResult ? rpcResult.error : null
  if (rpcError) {
    console.error('[guest-seat-claim] claim_guest_rsvps failed', { profileId, message: rpcError.message })
    return null
  }

  try {
    const since = new Date(Date.now() - JUST_CLAIMED_MS).toISOString()

    // What the claim just converted. `guest_claimed_by` + `guest_claimed_at` are written by the RPC
    // in the same statement that sets profile_id, so they are the exact record of this claim and the
    // reason no pre-read is needed. Rows the RPC DELETED (a duplicate of a member seat they already
    // held) never appear here, which is correct: nothing changed for them.
    //
    // Readable under RLS precisely BECAUSE the claim already ran: the policy grants a member their
    // own rows, and these rows are now theirs.
    const { data: claimedRaw } = await session
      .from('event_rsvps')
      .select('event_id, status')
      .eq('guest_claimed_by', profileId)
      .gte('guest_claimed_at', since)

    const claimed = (claimedRaw ?? []) as { event_id: string; status: string }[]
    // Only a confirmed seat is worth landing on. A waitlisted claim is a real claim, but check-in
    // refuses a non-'going' RSVP, so sending them to the page would be an invitation to a button
    // that does nothing.
    const eventIds = claimed.filter((r) => r.status === 'going').map((r) => r.event_id)
    if (!eventIds.length) return null

    const { data: eventsRaw } = await session
      .from('events')
      .select('slug, starts_at, ends_at, is_cancelled, time_zone')
      .in('id', eventIds)

    const events = (eventsRaw ?? []) as {
      slug: string
      starts_at: string
      ends_at: string | null
      is_cancelled: boolean
      time_zone: string | null
    }[]

    return pickSeatLanding(
      events
        .filter((e) => !e.is_cancelled)
        .map((e) => ({ slug: e.slug, startsAt: e.starts_at, endsAt: e.ends_at, timeZone: e.time_zone })),
    )
  } catch {
    // The seat is already attached at this point — only the convenience redirect is lost.
    return null
  }
}
