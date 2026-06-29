import { getEventContext } from '@/lib/events/active-event'
import { EventFactPanel } from '@/components/events/event-fact-panel'

// The movable FACTS block (the `event-facts` layout module): the critical-info card — when, how
// full, and who's going — an operator places anywhere on the event page. A zero-prop self-fetching
// RSC reading the request-scoped event context (lib/events/active-event.ts); the page resolves every
// input once and stamps it, so there's no re-fetch or prop-drilling. The venue line + map are now
// their OWN movable block (`event-location`), so they're not here. Renders for both live and
// cancelled events (the facts still help a guest).
export const EventFacts = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { facts } = ctx

  return (
    <EventFactPanel
      whenLine={facts.whenLine}
      isOnline={facts.isOnline}
      onlineUrl={facts.onlineUrl}
      going={facts.going}
      nearFull={facts.nearFull}
      spotsLeft={facts.spotsLeft}
      guests={facts.guests}
      guestsAreVisible={facts.guestsAreVisible}
      viewerSignedIn={facts.viewerSignedIn}
      signInHref={facts.signInHref}
    />
  )
}
