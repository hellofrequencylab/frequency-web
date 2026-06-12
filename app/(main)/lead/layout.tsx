import { requireLeadFloor } from '@/lib/admin/guard'

// The Leader surface (/lead/*): a network-scoped home for community leaders
// (host/guide/mentor) to see what they lead, AFTER /admin became staff-only. This
// is NOT /admin — it has no operator workspace chrome; it rides the standard (main)
// member shell (left rail + global community right rail, registered in
// lib/layout/page-chrome.ts). The single job here is the entry gate: host+ on the
// trust ladder, view-as aware, redirect to /feed otherwise. Pages below scope every
// read to the caller's own circles (no platform-wide queries live under /lead).
export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  await requireLeadFloor()
  return <>{children}</>
}
