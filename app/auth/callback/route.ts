import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { FUNNELS } from '@/lib/funnels/definitions'
import {
  SIGN_IN_HINT_COOKIE,
  SIGN_IN_HINT_MAX_AGE,
  encodeSignInHint,
  lastSignInMethod,
  maskEmail,
} from '@/lib/auth/sign-in-hint'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
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

// Must match the cookie set in app/sign-in/actions.ts (stashNext).
const POST_LOGIN_COOKIE = 'fq_post_login'

// Supabase redirects here after a magic-link click or OAuth consent.
// The `code` query param is a one-time PKCE code that must be exchanged
// for a session on the server; the browser never sees the raw tokens.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Post-login destination (defaults to feed). It's carried in the short-lived
  // `fq_post_login` cookie set at sign-in (a `?next=` query param is also honoured
  // for invite links). Both are attacker-influenceable, so only accept a
  // same-origin absolute path; anything starting with `//` or `/\` is a
  // protocol-relative open-redirect to another host.
  const cookieStore = await cookies()
  const asked = searchParams.get('next') ?? cookieStore.get(POST_LOGIN_COOKIE)?.value ?? null
  const requested = asked ?? '/feed'
  const next =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
      ? requested
      : '/feed'
  // Whether a destination was actually ASKED FOR, as opposed to defaulted. The guest-seat landing
  // below may only fill the default: someone who followed a `?next=` (or whose sign-in stashed one)
  // asked to go somewhere, and a claim is never a reason to overrule them.
  const hasExplicitNext = asked !== null

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // No admission check here. This branch used to roll back a brand-new account (sign out +
      // delete the auth user) when platform_flags.beta_invite_only was ON and the email had not been
      // admitted off the beta waitlist. The waitlist is gone and the beta is open, so every
      // successful exchange proceeds.

      // `account.created` — the first row of the signup funnel, and until now the taxonomy declared
      // it (lib/analytics/events.ts) while NOTHING emitted it. Signup left no ledger trace at all,
      // so the step between arriving and finishing induction was invisible and no acquisition
      // channel could be judged.
      //
      // WHY HERE, and why "first" is not a timing question. Profile rows are written by a DB trigger
      // on auth.users (trg_on_auth_user_created), so there is no app code path that runs exactly once
      // at account creation. The nearest honest seam is the first successful code exchange. This
      // fires on EVERY successful sign-in and the STABLE idempotency key makes the ledger keep only
      // the first: engagement_events upserts on idempotency_key with ignoreDuplicates. Nothing to
      // reconcile, no window to miss, and a re-run cannot double-count.
      //
      // FAIL-SAFE, because this sits on the critical login path: everything below is wrapped and
      // swallowed. An analytics row is never worth failing an authentication for.
      // CLAIM-ON-SIGN-IN (ADR-1033): any event this person RSVP'd to while signed out becomes
      // theirs here, and if one of those events is happening RIGHT NOW they land on it instead of
      // the feed. Set inside the fail-safe block below; null means "use the normal destination".
      let seatLanding: string | null = null
      // FUNNEL RECOVERY (2026-08-31). The twin of seatLanding, for the same reason and the same
      // cookie-less arrival — see the `destination` note below, which already describes this exact
      // case for guests. A person who signed up through a feature funnel inside Instagram's in-app
      // browser opens the emailed link in Safari, arrives with no `fq_post_login`, defaults to
      // /feed, is bounced to /onboarding and then to /join with no `?seq` — landing in the GENERIC
      // Circles induction after asking for a breathwork timer. The funnel is stamped on the auth
      // user at sign-in (app/sign-in/actions.ts), which is the one carrier that survives the jump
      // between browsers, so it can be read back here. Null means "use the normal destination".
      let funnelLanding: string | null = null
      // THE WELCOME (PROG-GD5). The third recovery for the same cookie-less arrival: a guest who
      // paid for a Journey and opened the magic link in another browser. A claim that just attached
      // a Journey names that Journey's welcome; null means "use the normal destination".
      let orderLanding: string | null = null
      // THE LAST-SIGN-IN HINT (ADR-1392): how this person came in, with a masked address, so the
      // sign-in page can point a returning member at the same door. Null when it cannot be read.
      let signInHint: string | null = null

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const masked = maskEmail(user.email)
          if (masked) {
            signInHint = encodeSignInHint({
              method: lastSignInMethod(user.identities, user.app_metadata?.provider as string | undefined),
              masked,
            })
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle()
          if (profile?.id) {
            // `provider` distinguishes the magic link from Google, which is the `props.source` the
            // taxonomy asks for and the only thing separating the two doors at this point.
            const source = (user.app_metadata?.provider as string | undefined) ?? 'unknown'
            await track('account.created', { source }, profile.id, {
              idempotencyKey: `account.created:${profile.id}`,
            }).catch(() => {})

            // WHY HERE, and not only in onboarding. `claim_guest_rsvps` had one caller,
            // completeOnboarding, which covers a guest who signs UP and misses the commonest guest
            // of all: a member who was merely signed OUT when they RSVP'd. Their seat stranded
            // forever — real capacity held, absent from "my events", and never checkable-in, so
            // their attendance could never reach WAM (which counts distinct actor_profile_id).
            //
            // Sign-in is the seam where both things the SQL requires are true at once: auth.uid()
            // is the caller, and auth.users.email_confirmed_at was just stamped by the link they
            // clicked. The SESSION client is passed for the same reason the profile read above uses
            // it — under the service-role client auth.uid() is null, the claim matches nothing, and
            // the RLS policies that already grant a member their own seats would be bypassed for no
            // gain. The session exists here: exchangeCodeForSession has run and set the cookies.
            //
            // Cast per ADR-246: the RPC and the guest_claimed_* columns postdate the generated types.
            seatLanding = await claimGuestSeatsOnSignIn(
              supabase as unknown as SessionClient,
              profile.id,
            )

            // CONVERT-ON-SIGN-IN, the seat claim's CRM twin and the same seam for the same reason:
            // auth.uid() is the caller and auth.users.email_confirmed_at was just stamped. It joins
            // every `signup_leads` row held by this proven address to the member it turned out to
            // be — including the one the signed-out event RSVP form captured beside the seat.
            //
            // SESSION client, like the claim above: the function resolves the profile from
            // auth.uid(), so under the service-role client it would match nothing and convert
            // nothing. It returns void ON PURPOSE — unlike the seat claim it may NOT influence the
            // destination, and it swallows its own failures, so it can never block authentication.
            // Cast per ADR-246: the RPC postdates the generated types.
            await convertLeadsOnSignIn(supabase as unknown as LeadSessionClient)

            // CLAIM-ON-SIGN-IN, THE TICKET LEG. The third member of this set, and the only one
            // where somebody paid money: a guest ticket (event_tickets with buyer_profile_id NULL
            // and guest_email set) is a real payment attached to no account, absent from "my
            // events" and impossible to check in. `claim_guest_tickets()` attaches every unclaimed
            // ticket matching the address auth.users has just proven.
            //
            // SESSION client, for the reason both neighbours above carry: the RPC resolves the
            // caller with auth.uid(), so under the service-role client it matches nobody and
            // returns a healthy 0 having attached nothing. Returns void ON PURPOSE — like the lead
            // conversion and unlike the seat claim, it may not influence the destination; the seat
            // claim already owns that decision. Swallows its own failures.
            // Cast per ADR-246: the RPC postdates the generated types.
            await claimGuestTicketsOnSignIn(supabase as unknown as TicketSessionClient)

            // CLAIM-ON-SIGN-IN, THE ORDER LEG (LIVE-396). The fourth member of this set and the
            // second where somebody paid money: a guest Journey purchase (commerce_orders with
            // buyer_profile_id NULL and guest_email set) is a settled payment granting nothing,
            // because journey_enrollments.profile_id is NOT NULL and a guest cannot hold one.
            //
            // Unlike its three neighbours this does not finish in SQL. `claim_guest_orders()`
            // attaches the ORDER and returns the ids; the module then runs the ordinary
            // `enrolByOrder` for each, because adoptPlan is the single authority for what enrolling
            // means and SQL alone would grant a degraded enrolment missing its practices.
            //
            // SESSION client, for the reason all three neighbours carry. Swallows its own failures.
            // Returns the welcome of the Journey it just attached, or null (PROG-GD5): the second
            // landing decision after the seat claim, and for the same cookie-less reason.
            // Cast per ADR-246: the RPC postdates the generated types.
            orderLanding = await claimGuestOrdersOnSignIn(supabase as unknown as OrderSessionClient)
          }

          // Read the funnel back through the SAME map that wrote it. `user_metadata` is
          // user-influenceable in general, so the slug is never interpolated into a path until it
          // has been matched against the code funnels — this builds `/join?seq=<known slug>` or
          // nothing at all, and can therefore never become an open redirect or an arbitrary path.
          const seq = user.user_metadata?.funnel_seq
          if (typeof seq === 'string' && Object.prototype.hasOwnProperty.call(FUNNELS, seq)) {
            funnelLanding = `/join?seq=${encodeURIComponent(seq)}`
          }
        }
      } catch {
        // Swallowed on purpose. See FAIL-SAFE above.
      }

      // An explicitly requested destination always wins; the landing only fills the /feed default.
      // This is what makes the round trip survive the case the cookie cannot: a magic link opened in
      // a different browser than the one that asked for it arrives with no `fq_post_login` at all,
      // and a guest standing at the event would otherwise be dropped on the feed with their newly
      // claimed seat and no sign of the room they are in.
      //
      // 🔴 SEAT, THEN WELCOME, THEN FUNNEL, and the order is not arbitrary. A claimed seat can be
      // an event happening RIGHT NOW (that is the whole point of claimGuestSeatsOnSignIn); a
      // Journey welcome (PROG-GD5) is a purchase that keeps, but it is the thing they just paid
      // for and the reason they are signing in at all; a funnel recovery is only ever "resume the
      // thing you asked for", which keeps too. All three are recoveries for the SAME missing
      // cookie, so none may overrule a destination that was actually asked for — hence all sit
      // behind `!hasExplicitNext`.
      const recovered = seatLanding ?? orderLanding ?? funnelLanding
      const destination = !hasExplicitNext && recovered ? recovered : next

      const res = NextResponse.redirect(`${origin}${destination}`)
      res.cookies.delete(POST_LOGIN_COOKIE)
      if (signInHint) {
        res.cookies.set(SIGN_IN_HINT_COOKIE, signInHint, {
          httpOnly: true,
          sameSite: 'lax',
          secure: origin.startsWith('https://'),
          path: '/',
          maxAge: SIGN_IN_HINT_MAX_AGE,
        })
      }
      return res
    }
  }

  // Something went wrong. Send the user back to sign-in with a CODE, not a sentence — the form
  // owns the wording now, and only codes it recognises render at all (app/sign-in/errors.ts).
  return NextResponse.redirect(`${origin}/sign-in?error=callback`)
}
