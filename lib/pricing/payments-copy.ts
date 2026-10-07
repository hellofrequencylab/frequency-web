// THE PAYMENTS GATE'S WORDS (ADR-1709, LIVE-753). A zero-import leaf so a client form can read the
// refusal copy without pulling lib/pricing/payments-gate.ts (and its server reads) into the browser.
// CONTENT-VOICE: plain, no em dashes, and no typed prices.

/** Host-facing copy (CONTENT-VOICE: plain, no em dashes, no typed prices). */
export const PAYMENTS_REFUSAL_SPACE =
  'Taking payments comes with Business. Start its 14-day trial, or keep it free and receive tips.'
export const PAYMENTS_REFUSAL_PERSONAL =
  'Taking payments comes with a Business Space. Keep it free and receive tips, or run it from a Space on Business.'

/** Buyer-facing copy for a checkout refused on the seller's plan. Says nothing about the plan. */
export const PAYMENTS_BUYER_REFUSAL = 'This isn’t on sale right now. Ask the host how to join.'

/** Did a server action refuse on the payments gate? Lets a form turn an ActionResult error string
 *  back into the upgrade moment without a second channel. PURE. */
export function isPaymentsRefusal(message: string | null | undefined): boolean {
  return message === PAYMENTS_REFUSAL_SPACE || message === PAYMENTS_REFUSAL_PERSONAL
}

/** What Business adds, as the upgrade moment lists it (LIVE-758). Capabilities only: the price is
 *  read from the catalog by the panel's server loader (lib/pricing/business-offer.ts), never typed. */
export const BUSINESS_ADDS: readonly string[] = [
  'Paid tickets, paid memberships, and donations',
  'Shop checkout and booking deposits',
  'Higher limits on the tools you already use',
  'Nothing taken on your own audience, and a small fee only when the network brings you a customer',
]

/** The equal choice beside the trial. Tips stay open on every plan, with no fee. */
export const KEEP_IT_FREE_LINE = 'Guests can still send you tips, and nothing is taken from them.'
