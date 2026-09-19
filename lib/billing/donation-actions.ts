'use server'

// The one callable seam for giving (LIVE-235). A thin 'use server' wrapper over
// lib/billing/space-donation-checkout.ts, which cannot carry the directive itself because it also
// exports the pure helper and the webhook recorders (a server-action module may export only async
// functions).
//
// THE DONOR IS RESOLVED FROM THE SESSION, never posted. A signed-out donor is allowed on purpose
// (a gift does not require an account) and simply resolves to a null profile id, which the checkout
// treats as a self-sourced gift at 0%.

import { headers } from 'next/headers'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { rateLimitOk } from '@/lib/rate-limit'
import { createSpaceDonationCheckout, recordSpaceDonationFromSessionId } from './space-donation-checkout'
import { onPageCheckoutAvailable } from './stripe-browser'

/**
 * Start a gift to a Space's fund. Returns EITHER an on-page client secret or the hosted Checkout
 * URL (LIVE-359), or a member-facing refusal.
 *
 * ⚠️ Both fields are optional and exactly one arrives, so a caller that reads only `url` goes DEAD
 * the moment elements mode is on. components/billing/onpage-callers.test.ts fails any caller that
 * does not branch on both.
 */
export async function startSpaceDonationCheckout(
  spaceId: string,
  amountCents: number,
  message?: string | null,
  opts?: {
  /** 🔴 Set by a caller whose on-page form already FAILED, to demand a session it can redirect
   *  to. Without it the fallback re-asks for elements, gets another client secret, finds no `url`
   *  and dead-ends the buyer -- the live 2026-09-15 ticket failure. */
    forceHosted?: boolean
  },
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
  if (!spaceId) return fail('This fund is not available.')
  const donorProfileId = await getMyProfileId()
  const result = await createSpaceDonationCheckout({
    spaceId,
    amountCents,
    donorProfileId,
    message: message ?? null,
    // Ask for the on-page form only when the browser can actually mount it.
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  // `sessionId` rides ALONGSIDE the secret so the control can settle from its own success
  // handler instead of waiting on the webhook. See `settleDonationAction` below.
  if (result.clientSecret) return ok({ clientSecret: result.clientSecret, sessionId: result.sessionId })
  if (result.url) return ok({ url: result.url })
  return fail(result.error ?? 'Could not start your gift. Please try again.')
}

/**
 * Settle a Space gift the moment it is paid ON PAGE, without waiting for the webhook (LIVE-367).
 *
 * 🔴 WHY THIS IS NOT OPTIONAL. The on-page form confirms with `redirect: 'if_required'`, so the
 * common card path never navigates and the success URL carrying `session_id={CHECKOUT_SESSION_ID}`
 * is never visited. Until this existed, the webhook was the only thing that could flip the gift to
 * `succeeded` and send the receipt. A late, retried or misconfigured delivery therefore meant a
 * donor who had paid, behind a panel that had already said a receipt was on its way.
 *
 * The webhook remains the GUARANTEE; this is the fast path that makes the guarantee usually
 * unnecessary. Both are safe to run: `recordSpaceDonationFromSession` updates
 * `where status = 'pending'`, so whichever arrives second flips nothing and books nothing.
 *
 * No session gate: a gift does not require an account (the start action is the same). Stripe is
 * the authority.
 */
// authz-ok: STRIPE IS THE AUTHORITY, and a session-holder gate would add nothing.
// `recordSpaceDonationFromSessionId` re-fetches the session FROM STRIPE and refuses anything that
// is not `metadata.kind === 'space_donation'` AND `payment_status === 'paid'`, so the most a
// caller can do with an id that is not theirs is settle a gift that genuinely happened --
// precisely what the webhook does, unprompted, seconds later. Nothing is read back but a boolean.
export async function settleDonationAction(sessionId: string): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // ⚠️ `whenUnconfigured: 'allow'`, matching `settleTicketAction`, and for the same reason: this
  // runs AFTER a successful charge. Denying it protects nothing (the webhook settles the same
  // session regardless) and only deletes the fast path, silently, wherever the limiter is unwired.
  if (!(await rateLimitOk('settle_donation', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }
  try {
    const cents = await recordSpaceDonationFromSessionId(sessionId)
    return ok({ settled: cents != null })
  } catch (e) {
    // NEVER fatal to the donor. They paid; the webhook still owes them the receipt, and a thrown
    // reconcile must not turn a successful payment into an error message. Loud, because a
    // swallowed failure here is the invisible regression AGENTS.md names.
    console.error('[space-donation] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
}
