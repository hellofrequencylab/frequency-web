import { getEventContext } from '@/lib/events/active-event'
import { EventLocationMap } from '@/components/events/event-location-map'

// The venue MAP block (the `event-venue-map` layout module): a full-width map of where the event is,
// pinned by default at the BOTTOM of the event page's MAIN column (Event page overhaul). Reuses
// EventLocationMap — the event's own geocoded point wins, else the hosting circle's city-level pin.
// A zero-prop self-fetching RSC reading the request-scoped event context (lib/events/active-event.ts).
// Renders NOTHING when the event is online or has no geolocation at all (no venue point and no circle
// pin), so an event without a location shows no empty map.
export const EventVenueMapBlock = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { facts } = ctx
  if (facts.isOnline) return null
  if (!facts.venuePoint && !facts.mapPin) return null

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <EventLocationMap isOnline={facts.isOnline} mapPin={facts.mapPin} venuePoint={facts.venuePoint} />
    </div>
  )
}
