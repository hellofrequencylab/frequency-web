import { MapPin } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'
import { EventLocationMap } from '@/components/events/event-location-map'

// The movable LOCATION block (the `event-location` layout module): the where line + the venue
// map, as its own card an operator can place anywhere on the event page (it used to be lumped
// inside the facts card). A zero-prop self-fetching RSC reading the request-scoped event context
// (lib/events/active-event.ts); the map gate (published + in-person + geocoded) already lives in
// `facts.venuePoint` / `facts.mapPin`, set by the page. Renders nothing for an online event or
// when there's no point to plot, so it self-hides exactly like the old in-facts map.
export const EventLocation = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { facts } = ctx
  if (facts.isOnline) return null
  // Show the block when there's anything to place: an address line, OR a map point (the
  // event's own geocoded spot or the hosting circle's city pin). An in-person event with a
  // typed location but no geocode still shows its address here (the map self-hides).
  if (!facts.location && !facts.venuePoint && !facts.mapPin) return null

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-4">
      {facts.location && (
        <p className="flex items-start gap-2 text-sm text-text">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          {/* Deep-links into Maps (native app on a phone, the map site on desktop). */}
          {facts.mapsHref ? (
            <a
              href={facts.mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-strong hover:underline"
            >
              {facts.location}
            </a>
          ) : (
            <span>{facts.location}</span>
          )}
        </p>
      )}
      <EventLocationMap isOnline={facts.isOnline} mapPin={facts.mapPin} venuePoint={facts.venuePoint} />
    </div>
  )
}
