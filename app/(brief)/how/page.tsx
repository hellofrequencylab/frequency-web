import type { Metadata, Viewport } from 'next'
import { HowBrief } from './how-brief'

// /how: the advisor briefing ("How Frequency works, and where the money comes from").
// LINK-ONLY by design (owner 2026-11-16):
//   - noindex/nofollow/noarchive/nosnippet here, and NOT in app/sitemap.ts or the site nav.
//   - NOT added to app/robots.ts DISALLOW: a blocked page's noindex is never read (see the /join note there).
// Share as https://frequencylocal.com/how?r=<recipient> so each reader's engagement can be told apart
// (lib/how/brief-events.ts, docs/HOW-BRIEF.md).
export const metadata: Metadata = {
  title: 'How Frequency works',
  description: 'How Frequency works, and where the money comes from. A briefing.',
  robots: {
    index: false, follow: false, nocache: true, noarchive: true, nosnippet: true, noimageindex: true,
    googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true, 'max-snippet': 0, 'max-image-preview': 'none', 'max-video-preview': 0 },
  },
  // A clean preview when the link is pasted into a message; previews do not make a page indexable.
  // The card itself is opengraph-image.jpg / twitter-image.jpg beside this file (Next file convention).
  openGraph: {
    title: 'How Frequency works, and where the money comes from',
    description: 'Get people together. Do things on purpose. How members, hosts and local businesses meet in one network, and how it pays for itself.',
    type: 'article',
    url: '/how',
    siteName: 'Frequency',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Frequency works, and where the money comes from',
    description: 'Get people together. Do things on purpose.',
  },
  referrer: 'strict-origin-when-cross-origin',
}

export const viewport: Viewport = { themeColor: '#0A0612', colorScheme: 'dark' } // token-ok: browser chrome colour is a meta tag value, it cannot read a CSS variable

// Static: the brief reads no request data (the ?r= code is read client-side).
export const dynamic = 'force-static'

export default function HowPage() {
  return <HowBrief />
}
