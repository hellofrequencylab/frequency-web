'use server'

import { headers } from 'next/headers'
import { getMyProfileId } from '@/lib/auth'
import { createTipCheckout, recordTipFromSessionId } from '@/lib/billing/tips'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { rateLimitOk } from '@/lib/rate-limit'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Start a tip to a host/partner: validates + records a pending tip and returns EITHER an on-page
// client secret or the hosted Stripe Checkout URL (ADR-176, LIVE-359). Real money, destination
// charge — the recipient must already be payouts-ready.
//
// ⚠️ Both fields are optional and exactly one arrives, so a caller that reads only `url` goes DEAD
// the moment elements mode is on. components/billing/onpage-callers.test.ts fails any caller that
// does not branch on both.
export async function startTip(
  toProfileId: string,
  amountCents: number,
  message?: string,
  opts?: {
  /** 🔴 Set by a caller whose on-page form already FAILED, to demand a session it can redirect
   *  to. Without it the fallback re-asks for elements, gets another client secret, finds no `url`
   *  and dead-ends the buyer -- the live 2026-09-15 ticket failure. */
    forceHosted?: boolean
  },
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
  const fromProfileId = await getMyProfileId()
  if (!fromProfileId) return fail('Sign in to send a tip.')

  const r = await createTipCheckout({
    fromProfileId,
    toProfileId,
    amountCents,
    message,
    // Ask for the on-page form only when the browser can actually mount it. Without the
    // publishable key Stripe.js cannot load, so requesting elements would strand the buyer.
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (r.error) return fail(r.error)
  // `sessionId` rides ALONGSIDE the secret so the control can settle from its own success
  // handler instead of waiting on the webhook. See `settleTipAction` below.
  if (r.clientSecret) return ok({ clientSecret: r.clientSecret, sessionId: r.sessionId })
  if (!r.url) return fail('Could not start checkout.')
  return ok({ url: r.url })
}

/**
 * Settle a tip the moment it is paid ON PAGE, without waiting for the webhook (LIVE-367).
 *
 * 🔴 WHY THIS IS NOT OPTIONAL. The on-page form confirms with `redirect: 'if_required'`, so the
 * common card path never navigates and the success URL carrying `session_id={CHECKOUT_SESSION_ID}`
 * is never visited. Until this existed, the webhook was the only thing that could flip the tip to
 * `succeeded` and send the receipt. A late, retried or misconfigured delivery therefore meant a
 * tipper who had paid, behind a panel that had already said a receipt was on its way.
 *
 * The webhook remains the GUARANTEE; this is the fast path that makes the guarantee usually
 * unnecessary. Both are safe to run: `recordTipFromSession` updates `where status = 'pending'`, so
 * whichever arrives second flips nothing and notifies nothing.
 */
// authz-ok: STRIPE IS THE AUTHORITY, and a session-holder gate would add nothing.
// `recordTipFromSessionId` re-fetches the session FROM STRIPE and refuses anything that is not
// `metadata.kind === 'tip'` AND `payment_status === 'paid'`, so the most a caller can do with an
// id that is not theirs is settle a tip that genuinely happened -- precisely what the webhook
// does, unprompted, seconds later. Nothing is read back but a boolean, and the per-IP limiter is
// what stops that boolean being used to enumerate session ids.
export async function settleTipAction(sessionId: string): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // ⚠️ `whenUnconfigured: 'allow'`, matching `settleTicketAction`, and for the same reason: this
  // runs AFTER a successful charge. Denying it protects nothing (the webhook settles the same
  // session regardless) and only deletes the fast path, silently, wherever the limiter is unwired.
  if (!(await rateLimitOk('settle_tip', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }
  try {
    const cents = await recordTipFromSessionId(sessionId)
    return ok({ settled: cents != null })
  } catch (e) {
    // NEVER fatal to the tipper. They paid; the webhook still owes them the receipt, and a thrown
    // reconcile must not turn a successful payment into an error message. Loud, because a
    // swallowed failure here is the invisible regression AGENTS.md names.
    console.error('[tips] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
}
