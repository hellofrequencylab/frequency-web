import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The settings suite is one page now (DAWN 2 screen pass): the plan + payouts cards
// render as the #plan section of /settings (see ../page.tsx + section.tsx). This route
// stays as a QUERY-PRESERVING redirect because Stripe return URLs point here
// (lib/billing/checkout.ts success_url `?upgraded=1&session_id=…`, lib/billing/connect.ts
// `?payouts=return|refresh`, lib/billing/bundle-checkout.ts `?bundle=1&session_id=…`):
// the params are forwarded to /settings, where PlanSection runs the same confirm/sync
// logic as before.

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
  redirect(`/settings${query ? `?${query}` : ''}#plan`)
}
