import { claimGuestSeatsOnSignIn, type SessionClient } from '@/lib/events/guest-seat-claim'
import {
  convertLeadsOnSignIn,
  type SessionClient as LeadSessionClient,
} from '@/lib/crm/convert-leads-on-sign-in'
import {
  claimGuestTicketsOnSignIn,
  type SessionClient as TicketSessionClient,
} from '@/lib/events/claim-guest-tickets-on-sign-in'
import {
  claimGuestOrdersOnSignIn,
  type OrderSessionClient,
} from '@/lib/commerce/claim-guest-orders-on-sign-in'

// THE POST-SIGN-IN STEP (LIVE-718): the four claims that attach what a person did as a guest to
// the account they just proved, in one place, so the web's auth callback and a native sign-in run
// the same thing. Before this the four lived inline in app/auth/callback/route.ts, and an app that
// exchanges its own PKCE code with supabase-js never hits that route: a guest who bought a ticket
// and then signed in on the phone would not see it.
//
// THE CLIENT MUST BE THE CALLER'S SESSION. Every claim resolves the person from auth.uid(): under
// the service-role client auth.uid() is null and each matches nothing. The web passes the cookie
// session client; /api/v1/session/bootstrap passes the bearer client (asCaller). Sign-in is also
// the seam where auth.users.email_confirmed_at has just been stamped, which the SQL requires.
//
// IDEMPOTENT. Each claim attaches only rows still unclaimed, so running it on every app cold start
// is safe and is what the bootstrap endpoint does.
//
// FAIL-SAFE. Each claim swallows its own failures (they sit on the login path, and a failed claim
// is never worth failing an authentication for). The callback still wraps the call.
//
// THE ORDER IS THE CALLBACK'S, unchanged:
//   1. seats (ADR-1033): a guest RSVP becomes theirs; returns a landing when that event is live now.
//   2. leads: signup_leads held by this proven address join the member (and spend a typed name).
//   3. tickets: guest event_tickets attach (somebody paid money).
//   4. orders (LIVE-396): guest Journey purchases attach and enrol; returns that Journey's welcome
//      (PROG-GD5).
// The two landings are recoveries for a cookie-less arrival; the caller decides precedence.

export interface PostSignInResult {
  /** A live event's page when a just-claimed seat is happening now, else null. */
  seatLanding: string | null
  /** The welcome of a Journey a just-claimed order enrolled in, else null. */
  orderLanding: string | null
}

/** Legs 1 to 3 (seats, leads, tickets) for the session's own profile; returns the seat landing.
 *  The web callback runs these and then the order leg itself, because it reads the order landing
 *  in place (PROG-GD5 pins that shape). Casts per ADR-246: the RPCs postdate the generated types. */
export async function runGuestClaims(supabase: unknown, profileId: string): Promise<string | null> {
  const seatLanding = await claimGuestSeatsOnSignIn(supabase as SessionClient, profileId)
  await convertLeadsOnSignIn(supabase as LeadSessionClient)
  await claimGuestTicketsOnSignIn(supabase as TicketSessionClient)
  return seatLanding
}

/** All four legs, in the callback's order: what a native sign-in runs (/api/v1/session/bootstrap). */
export async function runPostSignInClaims(supabase: unknown, profileId: string): Promise<PostSignInResult> {
  const seatLanding = await runGuestClaims(supabase, profileId)
  const orderLanding = await claimGuestOrdersOnSignIn(supabase as OrderSessionClient)
  return { seatLanding, orderLanding }
}
