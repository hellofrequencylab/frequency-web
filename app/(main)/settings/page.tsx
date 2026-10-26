import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { SettingsBody } from '@/components/frequency/members/settings/settings-body'

// The member Settings suite as ONE page (DAWN 2 screen pass, per
// design_handoff/dawn/ui_kits/screens/settings.html): a chip section-rail up top, then
// the whole suite stacked — Appearance (the skin picker leads), the four-channel
// notification grid, Install the app (LIVE-703), Connections and location, Account and
// privacy, Plan and billing, then Memberships (Spaces this member belongs to, LIVE-423).
// Each section keeps the exact forms + server actions its old standalone route had (the
// old routes now redirect to their anchor here); this page only composes them.
//
// Framework notes (docs/PAGE-FRAMEWORK.md): a Focus template surface; the rail stays
// 'global' via lib/layout/page-chrome.ts (the /settings row already exists — no change).
// Speed is structural: every section fetches its own data behind its own <Suspense>, so
// the shell + chips paint immediately and no section blocks another.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your whole settings suite on one page.',
}


export default async function SettingsPage({
  searchParams,
}: {
  // Stripe return URLs also append `upgraded=1` / `bundle=1` markers, but nothing reads them
  // (the old billing page never did either — `session_id` alone drives the confirm), so they
  // are deliberately not typed here.
  searchParams: Promise<{ session_id?: string; payouts?: string }>
}) {
  // The suite is a signed-in surface (the old billing page gated the same way).
  const myProfileId = await getMyProfileId()
  if (!myProfileId) redirect('/sign-in?next=/settings')

  // Stripe checkout / Connect returns land here via the /settings/billing redirect.
  const params = await searchParams
  return <SettingsBody sessionId={params.session_id} payouts={params.payouts} />
}



