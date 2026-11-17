import type { Metadata } from 'next'

// LINK-ONLY pages (owner 2026-11-16 for /how, 2026-11-17 for /facilities and /lab): pages Daniel shares
// with partners by link. Never indexed, never followed, not in app/sitemap.ts or the site nav, and NOT
// in app/robots.ts DISALLOW (a blocked page's noindex is never read). One robots block, so the pages
// cannot drift apart.
export const LINK_ONLY_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true, 'max-snippet': 0, 'max-image-preview': 'none', 'max-video-preview': 0 },
}
