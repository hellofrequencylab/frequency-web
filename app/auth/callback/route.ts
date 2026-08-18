import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
import { claimGuestSeatsOnSignIn, type SessionClient } from '@/lib/events/guest-seat-claim'

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

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
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
      const destination = !hasExplicitNext && seatLanding ? seatLanding : next

      const res = NextResponse.redirect(`${origin}${destination}`)
      res.cookies.delete(POST_LOGIN_COOKIE)
      return res
    }
  }

  // Something went wrong. Send the user back to sign-in with a CODE, not a sentence — the form
  // owns the wording now, and only codes it recognises render at all (app/sign-in/errors.ts).
  return NextResponse.redirect(`${origin}/sign-in?error=callback`)
}
