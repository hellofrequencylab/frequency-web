/**
 * ONE place that knows how a Checkout Session spells "where the buyer ends up", and one place that
 * decides what came back (LIVE-359).
 *
 * LIVE-347 proved the on-page card form on tickets. Nine creators need the same three edits, and
 * the part worth sharing is not the plumbing -- it is the REASONING, which was ~40 lines of comment
 * in `tickets.ts` explaining two Stripe asymmetries and one deliberate degrade. Copied eight times
 * it would drift eight ways, and the drift would be invisible: the `stripe` package ships no type
 * declarations at all, so `Stripe.*` is `any` and a creator that spells a field wrong fails at
 * RUNTIME, in a money path, never at build.
 *
 * So the asymmetries live here, stated once, and each creator passes its own URLs.
 */

/** Hosted = Stripe owns the page. Elements = we render the card form on Frequency. */
export type CheckoutUi = 'hosted' | 'elements'

export interface CheckoutUiResult {
  /** Set for a hosted session: send the buyer here. */
  url?: string
  /**
   * Set for an elements session INSTEAD of `url`: mount the card form with it.
   *
   * ⚠️ Exactly one of `url` / `clientSecret` is ever set, so callers branch on which one ARRIVED
   * rather than on which one they asked for. That is what makes the degrade below safe.
   */
  clientSecret?: string
  error?: string
}

/**
 * The redirect fields, in the spelling the requested mode actually accepts.
 *
 * Hosted Checkout takes `success_url` + `cancel_url`, because Stripe owns the page and has to know
 * where to send the browser back to. An `ui_mode: 'elements'` session is rendered by US, so there
 * is no "back": Stripe REJECTS both of those fields in a non-hosted mode and takes a single
 * `return_url`, used only when a payment method redirects away and returns (3DS, a bank app).
 *
 * 🔴 `session_id={CHECKOUT_SESSION_ID}` MUST SURVIVE THE SWAP wherever the success path settles
 * without waiting for the webhook. That placeholder is what lets a landing page read
 * `?...&session_id=...` and reconcile immediately, so the buyer can see their own purchase even if
 * the webhook is late, retried, or never arrives. Callers pass it inside `successUrl`; this helper
 * never invents it, because only the caller knows whether its landing page reads one.
 */
export function checkoutReturnFields(
  ui: CheckoutUi,
  opts: { successUrl: string; cancelUrl: string },
): Record<string, string> {
  return ui === 'elements'
    ? { ui_mode: 'elements', return_url: opts.successUrl }
    : { success_url: opts.successUrl, cancel_url: opts.cancelUrl }
}

/**
 * What came back, and the DELIBERATE DEGRADE.
 *
 * An elements session has `url: null` and carries a `client_secret`; a hosted one is the reverse.
 * If we asked for elements and got a secret, hand it back and the form mounts on our page.
 *
 * 🔴 If we asked for elements and got NO secret, fall through to the hosted URL rather than
 * erroring. That is the whole safety property: the on-page form is an ENHANCEMENT over a working
 * redirect, so every way it can fail to materialise -- an API version that does not know the mode,
 * a Stripe-side rejection, a field this repo has wrong -- lands the buyer on Stripe's page instead
 * of a dead end. The compiler cannot help here, so this branch is the check.
 *
 * The degrade is LOUD. A swallowed fallback would read as "the on-page form is live" while every
 * buyer is quietly still being redirected -- the exact shape LIVE-347's first probe had, and what
 * AGENTS.md means by "every fail-safe needs a gate that notices it fired".
 */
export function resolveCheckoutSession(
  session: { id?: string; url?: string | null; client_secret?: unknown },
  ui: CheckoutUi,
  /** Log prefix identifying the creator, e.g. `'tips'` -- so a degrade names who degraded. */
  label: string,
): CheckoutUiResult {
  const wantsElements = ui === 'elements'

  if (wantsElements && typeof session.client_secret === 'string' && session.client_secret) {
    return { clientSecret: session.client_secret }
  }
  if (wantsElements) {
    console.error(
      `[${label}] elements checkout was requested but Stripe returned no client_secret; falling back to the hosted redirect`,
      { sessionId: session.id },
    )
  }
  if (!session.url) return { error: 'Could not start checkout.' }
  return { url: session.url }
}
