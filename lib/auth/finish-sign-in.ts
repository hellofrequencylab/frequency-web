import { FUNNELS } from '@/lib/funnels/definitions'
import { encodeSignInHint, maskEmail } from '@/lib/auth/sign-in-hint'
import { safeNextPath } from '@/lib/auth/safe-next'
import { track } from '@/lib/analytics/track'
import { readGaIdentity } from '@/lib/analytics/ga-client-id'
import { runGuestClaims } from '@/lib/auth/post-sign-in'
import { claimGuestOrdersOnSignIn, type OrderSessionClient } from '@/lib/commerce/claim-guest-orders-on-sign-in'

// THE STEPS AFTER A PASSWORD SIGN-IN (SEC-045). A magic link and Google both land on /auth/callback, and
// that route does four things after it exchanges the code: the `account.created` ledger row, the
// guest claims (seats, leads, tickets, orders; lib/auth/post-sign-in.ts), the funnel recovery and the
// last-sign-in hint. A password sign-in never visits the callback: signInWithPassword sets the session
// cookies inside the server action. Without this, a guest who bought a ticket and then signed in with a
// password would not see it, which is the exact hole LIVE-718 closed for the native app.
//
// SAME ORDER, SAME PRECEDENCE as the callback: an asked-for destination wins; otherwise seat, then the
// Journey welcome, then the funnel, then /feed. FAIL-SAFE: everything after the session exists is
// swallowed, because an analytics row or a claim is never worth failing a sign-in for.

/** The session client the action already holds. Kept loose for the same reason as post-sign-in.ts. */
interface SessionLike {
  auth: { getUser: () => Promise<{ data: { user: AuthUserLike | null } }> }
  from: (table: string) => unknown
}

interface AuthUserLike {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

interface FinishedSignIn {
  /** Where to send the person, already validated as a same-origin path. */
  destination: string
  /** The encoded last-sign-in hint for SIGN_IN_HINT_COOKIE, or null. */
  hint: string | null
}

export async function finishSignIn(supabase: unknown, asked: string | null): Promise<FinishedSignIn> {
  const client = supabase as SessionLike
  const next = safeNextPath(asked) || '/feed'
  const hasExplicitNext = !!safeNextPath(asked)
  let seatLanding: string | null = null
  let orderLanding: string | null = null
  let funnelLanding: string | null = null
  let hint: string | null = null

  try {
    const {
      data: { user },
    } = await client.auth.getUser()
    if (user) {
      const masked = maskEmail(user.email)
      if (masked) {
        // This door is only ever a password, so the hint says so and the next visit opens on it.
        hint = encodeSignInHint({ method: 'password', masked })
      }
      const profileQuery = client.from('profiles') as {
        select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } }
      }
      const { data: profile } = await profileQuery.select('id').eq('auth_user_id', user.id).maybeSingle()
      if (profile?.id) {
        await track('account.created', { source: 'password' }, profile.id, {
          idempotencyKey: `account.created:${profile.id}`,
          gaIdentity: await readGaIdentity(),
        }).catch(() => {})
        seatLanding = await runGuestClaims(supabase, profile.id)
        orderLanding = await claimGuestOrdersOnSignIn(supabase as OrderSessionClient)
      }
      // Read back through the SAME map that wrote it, never trusted as a path (see the callback).
      const seq = user.user_metadata?.funnel_seq
      if (typeof seq === 'string' && Object.prototype.hasOwnProperty.call(FUNNELS, seq)) {
        funnelLanding = `/join?seq=${encodeURIComponent(seq)}`
      }
    }
  } catch {
    // Swallowed on purpose. See FAIL-SAFE above.
  }

  const recovered = seatLanding ?? orderLanding ?? funnelLanding
  return { destination: !hasExplicitNext && recovered ? recovered : next, hint }
}
