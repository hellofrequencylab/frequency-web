import { permanentRedirect } from 'next/navigation'

// /demo is retired. It redirects straight to /the-community (the live destination) rather than
// hopping through /how-it-works (which itself 308s to /the-community) — one hop, not two, so
// crawlers don't chase a redirect chain (site-audit SEO-1).
export default function DemoRedirect() {
  permanentRedirect('/the-community')
}
