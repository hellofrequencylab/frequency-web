import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Events subtree layout: pass-through chrome-wise; its one job is to stamp the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here.
// Covers the index AND every event, draft, scan and calendar page under /events/*.
//
// EVENTS IS THE ONE AREA THAT IS ALSO A MEMBER NOUN, and that is deliberate (owner ruling,
// LIVE-243): Events holds its own left-rail row as well as a Marketplace tab, so it appears
// twice. The consequence is that browsing /events from the rail also teaches the umbrella
// "Events" — which is the intended behaviour, not a leak. /marketplace returns to
// commerceSurfaceHref('events'), the COMMERCE face (/events?price=paid), so the umbrella door
// stays the paid-and-ticketed view even though the cookie was stamped from the full index.
export default function EventsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="events" />
      {children}
    </>
  )
}
