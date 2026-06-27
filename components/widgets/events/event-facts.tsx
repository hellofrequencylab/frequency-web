import { getEventContext } from '@/lib/events/active-event'
import { EventFactPanel } from '@/components/events/event-fact-panel'

// The movable FACTS block (the `event-facts` layout module): the critical-info card — when, where
// (with the city-level mini map OR the exact-venue map), how full, and who's going — an operator
// places anywhere on the event page. A zero-prop self-fetching RSC reading the request-scoped event
// context (lib/events/active-event.ts); the page resolves every input once and stamps it, so there's
// no re-fetch or prop-drilling.
//
// The exact-venue map gate (published + in-person + geocoded) lives in `facts.venuePoint`: the page
// sets it to null otherwise, so EventFactPanel only ever draws the precise pin when it's allowed —
// preserving the venue-map gate exactly. Renders for both live and cancelled events (the facts still
// help a guest), matching the page's old fact panel.
export const EventFacts = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { facts } = ctx

  return (
    <EventFactPanel
      whenLine={facts.whenLine}
      isOnline={facts.isOnline}
      location={facts.location}
      onlineUrl={facts.onlineUrl}
      mapPin={facts.mapPin}
      venuePoint={facts.venuePoint}
      going={facts.going}
      nearFull={facts.nearFull}
      spotsLeft={facts.spotsLeft}
      guests={facts.guests}
      guestsAreVisible={facts.guestsAreVisible}
    />
  )
}
