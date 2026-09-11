import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The settings suite is one page now (DAWN 2 screen pass): the plan + payouts cards
// render as the #plan section of /settings (see ../page.tsx + section.tsx). This route
// stays as a QUERY-PRESERVING redirect because Stripe return URLs point here
// (lib/billing/checkout.ts success_url `?upgraded=1&session_id=…`, lib/billing/connect.ts
// `?payouts=return|refresh`, lib/billing/bundle-checkout.ts `?bundle=1&session_id=…`):
// the params are forwarded to /settings, where PlanSection runs the same confirm/sync
// logic as before.
//
// 🔴 AND IT CHOOSES THE FRAGMENT, which is the half of LIVE-290 that is easy to miss. Per RFC 7231
// §7.1.2 a fragment on the ORIGINAL request URL is carried onto the redirect target only when the
// `Location` header has none of its own. This route used to hard-code `#plan` on every redirect, so
// `connect.ts` appending `#payouts` to its return_url would have been silently overridden and a host
// who had just finished Stripe onboarding still landed on the plan card and had to hunt for the
// confirmation. Fixing only `connect.ts` turns a probe green while leaving the operator exactly where
// they were, which is the shape of an ADR-970 "reads as coverage" failure.
//
// So: a Connect return goes to the payouts card, and a CHECKOUT return (`?session_id`, `?upgraded=1`,
// `?bundle=1`) keeps `#plan`, because those confirm a plan change and that is the card that shows it.

/** The `/settings` fragment a return should land on, from its query alone. PURE and exported so the
 *  RFC-7231 hazard above is unit-testable rather than only reasoned about. */
export function settingsFragmentFor(params: Record<string, string | string[] | undefined>): string {
  return typeof params.payouts === 'string' ? '#payouts' : '#plan'
}

export default async function BillingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value)
  }
  const query = qs.toString()
  redirect(`/settings${query ? `?${query}` : ''}${settingsFragmentFor(params)}`)
}
