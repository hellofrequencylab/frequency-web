import Link from 'next/link'
import { EventCompose } from '@/app/(main)/events/event-compose'
import { CalendarSubscribe } from '@/components/events/calendar-subscribe'
import { HERO_SECONDARY_BTN } from './hero-buttons'

// The member action cluster for the unified Events header on /events (the one events home; the
// /marketplace/events twin was retired by ADR-866). Manage + My drafts appear only once the member
// has added an event (the owner rule). No em dashes.
//
// 🔴 NEW EVENT IS NO LONGER GATED (ADR-913). It was wrapped in CrewGateButton, so a free Member was
// shown an upgrade popup for the act of creating an event at all — while the SERVER never gated
// creation (app/(main)/events/actions.ts checks only "signed in + may place in this scope"). So the
// wall was UI-only and in the wrong place.
//
// The owner ruling moved it: *"A member can create an event but must upgrade to Crew or Space to take
// tickets. Members can have RSVP."* Creating and filling a room is the product; charging for a seat is
// the paid part. The wall now lives at the price field (lib/events/ticket-eligibility.ts), which is
// both the honest place for it and the highest-intent upgrade moment in the product.
export function EventsHeaderActions({
  myProfileId,
  isCrew: _isCrew,
  userHasEvents,
}: {
  myProfileId: string | null
  /** @deprecated Unused since ADR-913 — creating an event is not a paid feature. Kept so the call
   *  sites keep type-checking; remove once /events stops resolving it. */
  isCrew?: boolean
  userHasEvents: boolean
}) {
  if (!myProfileId) return null
  return (
    <>
      <EventCompose />
      {/* The master Frequency calendar (Events EC3) — every upcoming public event on one grid + a
          subscribable feed. Shown to any signed-in member beside New Event. */}
      <Link href="/events/calendar" className={HERO_SECONDARY_BTN}>
        Calendar
      </Link>
      {/* The member's OWN calendar feed (Events B-4): subscribe the events they're going to into Google
          or Apple. Resolves the member's private feed token server-side (ensure_calendar_token) and
          renders nothing for signed-out visitors; safe to mount here for any signed-in member. */}
      <CalendarSubscribe />
      {userHasEvents && (
        <>
          <Link href="/admin/events" className={HERO_SECONDARY_BTN}>
            Manage
          </Link>
          <Link href="/events/drafts" className={HERO_SECONDARY_BTN}>
            My drafts
          </Link>
        </>
      )}
    </>
  )
}
