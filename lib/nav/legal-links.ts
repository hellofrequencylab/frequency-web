// THE LEGAL SET, ONE LIST (LIVE-1030). Every footer that names the policies reads it: the public site
// footer (lib/frequency/site-nav.ts FOOTER_LEGAL), the member site map (lib/nav/registry.ts, the Legal
// column), the mega footer's legal row, its JSON-LD and llms.txt. A policy added here shows up in all of
// them; a page added anywhere else is a policy a visitor cannot find.
//
// Pure data, no imports of app code, so the registry (reachable from the app shell) stays light.

interface LegalLink {
  id: string
  label: string
  href: string
}

/** The policies, in the order a visitor looks for them. All are public pages. */
export const LEGAL_LINKS: readonly LegalLink[] = [
  { id: 'privacy', label: 'Privacy', href: '/privacy' },
  { id: 'terms', label: 'Terms', href: '/terms' },
  { id: 'guidelines', label: 'Guidelines', href: '/guidelines' },
  { id: 'space-email-policy', label: 'Space email policy', href: '/space-email-policy' },
  { id: 'accessibility', label: 'Accessibility', href: '/help#accessibility' },
]
