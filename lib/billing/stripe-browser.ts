// The BROWSER half of Stripe, loaded once per document and never at import time (LIVE-347).
//
// Modelled on lib/maps/google-loader.ts, which solved the identical problem for Google Maps: one
// memoised promise, a rejection contract instead of a throw, and a watchdog so a blocked script
// cannot leave an empty box on the page forever.
//
// 🔴 WHY `@stripe/stripe-js/pure` AND NOT `@stripe/stripe-js`. The default entry point injects
// Stripe's script tag as a SIDE EFFECT OF BEING IMPORTED. Anything that imports it -- however
// indirectly, however conditionally it renders -- starts a third-party network request on every
// page that pulls it in. `/pure` exports the same `loadStripe` with that side effect removed, so
// the request happens only when someone actually calls it. On a checkout control that renders on
// an event page, that is the difference between "loads when a buyer clicks buy" and "loads for
// every visitor who opens the page".
//
// This module is import-safe on the server: it reads env at call time, touches no browser API at
// module scope, and is only ever awaited from inside an effect or a click handler.
import { loadStripe } from '@stripe/stripe-js/pure'
// `import type` is erased by the compiler, so this names the type WITHOUT creating a runtime edge
// to the side-effecting entry point. (It is the same distinction scripts/check-shell-weight.mjs
// makes when it walks static imports: a type-only import is not a runtime edge.)
import type { Stripe } from '@stripe/stripe-js'

/** Public by design -- a publishable key is meant to ship to the browser. */
export const PUBLISHABLE_KEY_ENV = 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'

/**
 * The key, or null when it is not configured.
 *
 * ⚠️ Read through a literal `process.env.NEXT_PUBLIC_...` rather than `process.env[SOME_CONST]`.
 * Next.js inlines NEXT_PUBLIC_ vars into the client bundle by STATIC TEXT SUBSTITUTION at build
 * time; a computed key is not substituted and reads as undefined in the browser no matter what the
 * environment holds. The constant above exists for error messages and tests, never for the read.
 */
export function publishableKey(): string | null {
  const key = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim()
  return key || null
}

/**
 * Whether an on-page card form can be attempted at all.
 *
 * The caller uses this to decide whether to ASK for `ui_mode: 'elements'`. With no publishable key
 * there is nothing to mount, so the checkout stays on the proven hosted redirect rather than
 * rendering a form that can never initialise. This is the first of the two degrade points; the
 * second is server-side, in createTicketCheckout, for when Stripe declines to issue a secret.
 */
export function onPageCheckoutAvailable(): boolean {
  return publishableKey() !== null
}

/** A blocked, offline or hung script otherwise leaves the buyer looking at nothing. */
const LOAD_TIMEOUT_MS = 10_000

let pending: Promise<Stripe> | null = null

/**
 * Load Stripe.js once and share the promise.
 *
 * REJECTS rather than throwing at import time, and rejects on: a missing key, a script that never
 * arrives (blocked by an extension, offline, CSP), and a `loadStripe` that resolves null. Every
 * caller of this is a card form, so a rejection has exactly one correct handling -- fall back to
 * the hosted redirect -- and that is only possible if the failure is a value rather than a crash.
 */
export function loadStripeBrowser(): Promise<Stripe> {
  if (pending) return pending
  const key = publishableKey()
  if (!key) {
    // Not memoised: if the key arrives via a later deploy, a new page load should try again.
    return Promise.reject(
      new Error(`[stripe-browser] ${PUBLISHABLE_KEY_ENV} is not set, so no card form can mount`),
    )
  }
  pending = new Promise<Stripe>((resolve, reject) => {
    const watchdog = setTimeout(() => {
      pending = null
      reject(new Error('[stripe-browser] Stripe.js did not load within 10s'))
    }, LOAD_TIMEOUT_MS)
    loadStripe(key)
      .then((stripe) => {
        clearTimeout(watchdog)
        if (!stripe) {
          pending = null
          reject(new Error('[stripe-browser] loadStripe resolved null'))
          return
        }
        resolve(stripe)
      })
      .catch((err: unknown) => {
        clearTimeout(watchdog)
        pending = null
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
  return pending
}

/** Test seam: drops the memo so a following test loads fresh. Never called in app code. */
export function __resetStripeBrowserForTests(): void {
  pending = null
}

/**
 * Start loading Stripe.js NOW, without waiting for anyone to need it (LIVE-363).
 *
 * 🔴 THE LAG WAS SEQUENTIAL, AND THAT IS THE WHOLE POINT OF THIS FUNCTION. A buyer used to wait
 * for the server to build a Checkout Session (several database reads, a Connect status check, a
 * fee calculation, the Stripe API call and a reservation), and THEN wait for Stripe.js to arrive,
 * because nothing asked for the script until a client secret existed to render. Two slow things,
 * one after the other, both after the click.
 *
 * Called on intent (hover, focus, touch) and again at the top of the click handler, the script
 * downloads WHILE the server works. The two waits overlap instead of stacking, and by the time a
 * secret comes back the SDK is usually already resolved.
 *
 * Fire-and-forget by contract: it returns nothing and swallows everything. A warm-up that failed
 * is not an error -- `loadStripeBrowser()` will be called again for real and will report properly
 * then. The memo in that function is what makes this cheap: the second call is the same promise.
 *
 * Safe to call repeatedly, on every hover, and with no publishable key (it no-ops).
 */
export function warmStripeBrowser(): void {
  if (!publishableKey()) return
  void loadStripeBrowser().catch(() => {
    // Deliberately silent. The real call path reports; this one only ever pre-warms.
  })
}
