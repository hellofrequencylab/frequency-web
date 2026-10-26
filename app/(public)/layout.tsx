import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// Sitemap-advertised share URLs that used to live under (main) (SCAN-643 / ADR-1452).
// The member layout reads the session cookie and the request path before its public
// chrome. Without cacheComponents, one dynamic API in a parent voids the subtree —
// the sentence app/discover/layout.tsx and app/(marketing)/layout.tsx already paid
// to learn. This group does neither. Auth chrome upgrades after hydration via
// MarketingHeader detectClientAuth. Do not swap in SiteHeader here (SCAN-641).
// Space share URLs (/spaces/<slug> and /spaces/<slug>/podcasts/<show>) live here
// too (SCAN-644). Signed-in members rewrite to /full.

export default function PublicShareLayout({ children }: { children: React.ReactNode }) {
  // These share pages wear the public Frequency chrome, exactly as app/(marketing)/layout.tsx does, so a
  // listing or a product opened from the member Marketplace never lands in a second header. SiteShell
  // reads no request data, so the ISR pages under this group stay static. Public detail pages are COMMONS
  // (a Space, a listing, an event: things to read and act on, guidelines/site-themes.md), so the members
  // kit bodies here (the Space chrome) wear the light theme they were drawn for.
  return <SiteShell surface="commons">{children}</SiteShell>
}
