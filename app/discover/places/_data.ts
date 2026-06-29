// ── Public "Discover by place" data layer ─────────────────────────────────────
// Owned by the public city/place discovery surface (/discover/places). Every read
// here goes through the SAME redaction-safe public readers the rest of /discover
// uses (lib/discover): circles + events expose CITY-LEVEL location ONLY, never a
// neighborhood, street, venue, or geo point. This module never queries a table
// directly — it composes getPublicCircles + getPublicEvents and groups by `city`,
// exactly like getPublicCityClusters already does, so it can never surface
// anything the anon layer can't already see.

import {
  getPublicCircles,
  getPublicEvents,
  hasEventEnded,
  type PublicCircle,
  type PublicEvent,
} from '@/lib/discover'
import { citySlug, cityFromSlug } from '@/app/discover/events/_data'

// One city with everything a visitor can browse there. The counts drive the index
// cards + the city-hub stat band; the lists back the hub grids and the JSON-LD.
export type CityHub = {
  /** Display name as stored on the rows, e.g. "Encinitas". */
  city: string
  /** URL slug (lowercase, hyphenated), e.g. "encinitas". */
  slug: string
  circles: PublicCircle[]
  /** Upcoming events only (past ones are filtered out, mirroring the locator). */
  events: PublicEvent[]
}

// A lighter shape for the index grid — just the counts, no full lists.
export type CitySummary = {
  city: string
  slug: string
  circleCount: number
  eventCount: number
}

// Pull the public circles + upcoming events once and bucket them by city. Both
// reads are already capped + ordered by the RPCs (circles by member_count, events
// by start). A city with zero circles AND zero upcoming events never appears, so
// the index + sitemap only ever list places with something live to show.
async function loadCityBuckets(): Promise<Map<string, CityHub>> {
  const [circles, events] = await Promise.all([getPublicCircles(200), getPublicEvents(200)])
  const byCity = new Map<string, CityHub>()

  const bucket = (city: string): CityHub => {
    const slug = citySlug(city)
    const existing = byCity.get(slug)
    if (existing) return existing
    const fresh: CityHub = { city, slug, circles: [], events: [] }
    byCity.set(slug, fresh)
    return fresh
  }

  for (const c of circles) {
    if (!c.city) continue
    bucket(c.city).circles.push(c)
  }
  for (const e of events) {
    if (!e.city || hasEventEnded(e)) continue
    bucket(e.city).events.push(e)
  }

  return byCity
}

// Every city with at least one public circle or upcoming event, ordered by total
// activity (most going on first). Backs the /discover/places index + the sitemap.
export async function listDiscoverCities(): Promise<CitySummary[]> {
  const buckets = await loadCityBuckets()
  return [...buckets.values()]
    .map((h) => ({
      city: h.city,
      slug: h.slug,
      circleCount: h.circles.length,
      eventCount: h.events.length,
    }))
    .sort(
      (a, b) =>
        b.circleCount + b.eventCount - (a.circleCount + a.eventCount) ||
        a.city.localeCompare(b.city),
    )
}

// One city hub by its URL slug. Returns null when the place has nothing public to
// show, so the route 404s rather than render an empty, low-value facet page (the
// same rule the event city × category hubs follow).
export async function getCityHub(slug: string): Promise<CityHub | null> {
  const want = citySlug(cityFromSlug(slug)) // normalize round-trip
  const buckets = await loadCityBuckets()
  const hub = buckets.get(want)
  if (!hub || (hub.circles.length === 0 && hub.events.length === 0)) return null
  return hub
}

export { citySlug, cityFromSlug }
