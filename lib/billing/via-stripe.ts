// STRIPE CALLS THROW, AND A BILLING SURFACE IS ONE PAGE.
//
// A StripeInvalidRequestError is an ordinary outcome of a half-finished dashboard setup, not an
// exceptional one. On 2026-08-20 an incomplete Connect platform profile threw "You must complete
// your platform profile to use Connect and create live connected accounts" and, separately,
// "Please review the responsibilities of managing losses for connected accounts". Both escaped the
// action, tripped the error boundary, and replaced the WHOLE settings page — plan, billing, bundle
// seats and payouts — with "Something went wrong on our end". The member could no longer even read
// their plan because a payout button had failed (ADR-1093).
//
// So every Stripe reach on a billing surface goes through this: the real error is logged
// server-side (an operator needs the message and Stripe's request id to fix the dashboard), and
// the caller gets a readable failure that renders inline on the card that asked for it.
//
// WHY THIS IS A SHARED MODULE. ADR-1093 fixed the member surface and defined viaStripe privately
// inside it, so the sibling Space billing surface — three Stripe reaches, edited in the same
// range — kept throwing for another four days (LIVE-094). One page fixed, one page not, with no
// seam that made the omission visible. The guard belongs somewhere both surfaces can reach.

/** Run a Stripe call so it can never trip the error boundary. `label` names the call site in the
 *  server log; it is not shown to the member. */
export async function viaStripe<T>(
  label: string,
  run: () => Promise<T>,
): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await run() }
  } catch (err) {
    const e = err as { message?: string; requestId?: string }
    console.error(`[${label}]`, e?.message ?? err, e?.requestId ? `req=${e.requestId}` : '')
    return {
      error:
        'Stripe could not complete that just now. Try again in a moment, and if it keeps happening the platform’s Stripe setup needs a look.',
    }
  }
}
