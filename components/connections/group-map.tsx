'use client'

import { MapCanvas } from '@/components/maps/map-canvas'
import type { MapPin } from '@/components/maps/types'

export type GroupMapVenue = {
  /** The circle's PUBLIC meeting location. NEVER a member's home/live location (ADR-186). */
  latitude: number
  longitude: number
  name: string
  /** neighborhood / city line under the name. */
  place: string | null
}

export type GroupMapEvent = {
  id: string
  title: string
  /** Preformatted date string (e.g. "Wed, Jun 11"). */
  dateLabel: string
  /** Public venue coords for this event, or null when the event has none (then it isn't pinned). */
  latitude: number | null
  longitude: number | null
}

// A live venue map for one circle: its public meeting spot as the primary pin,
// and each upcoming event that carries public coordinates as a secondary pin.
// PRIVACY (ADR-186): only public venue coordinates are ever plotted here — no
// member home/live locations, no member pins. Loaded behind the maps-enabled
// gate by the server wrapper.
//
// Composes the map seam (ADR-901) instead of a map library directly: Google when a browsable
// key is configured, MapLibre + keyless OpenFreeMap tiles otherwise. Pin colours now come
// from the DAWN tokens the seam resolves (primary for the circle, secondary for its events)
// rather than the hardcoded hex this file used to carry.
export default function GroupMap({
  venue,
  events = [],
  className = 'h-[320px] w-full overflow-hidden rounded-2xl border border-border',
}: {
  venue: GroupMapVenue | null
  events?: GroupMapEvent[]
  className?: string
}) {
  // Graceful no-coordinates case: a tasteful panel instead of an empty map.
  if (!venue) {
    return (
      <div className="flex h-[320px] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 text-center">
        <p className="text-body-sm text-muted">No location set for this circle yet.</p>
      </div>
    )
  }

  const pins: MapPin[] = [
    {
      id: 'venue',
      lat: venue.latitude,
      lng: venue.longitude,
      title: venue.name,
      subtitle: venue.place,
      tone: 'primary',
    },
    // Only events that carry public coordinates get a pin (ADR-186).
    ...events
      .filter(
        (e): e is GroupMapEvent & { latitude: number; longitude: number } =>
          e.latitude != null && e.longitude != null,
      )
      .map((e) => ({
        id: e.id,
        lat: e.latitude,
        lng: e.longitude,
        title: e.title,
        subtitle: e.dateLabel,
        tone: 'secondary' as const,
      })),
  ]

  return (
    <MapCanvas
      center={[venue.longitude, venue.latitude]}
      zoom={13}
      pins={pins}
      // Fit only once there is more than the circle pin; with just the venue, stay at zoom 13.
      fit={{ padding: 60, maxZoom: 14, singleZoom: null }}
      className={className}
    />
  )
}
