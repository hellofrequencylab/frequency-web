// THE LAYOUT for a public route that stands outside the route groups: the legal pages (/privacy, /terms,
// /guidelines, /space-email-policy), the email landings (/manage-emails, /unsubscribe), /code-unavailable
// and the claim pages (/events/claim, /listings/claim, /spaces/claim). Each one's layout.tsx re-exports it.
//
// Under Frequency (ADR-1737, build-time) they wear the public site shell on COMMONS: reference and
// utility, which guidelines/site-themes.md keeps off Stage ("never put long reading on Stage"). Under DAWN
// it renders the page alone, exactly as these routes rendered before they had a layout.
//
// SiteShell reads no request data, so a static page here stays static and a dynamic one is unchanged.

import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

export function CommonsLayout({ children }: { children: React.ReactNode }) {
  if (SITE_DESIGN === 'frequency') return <SiteShell surface="commons">{children}</SiteShell>
  return children
}
