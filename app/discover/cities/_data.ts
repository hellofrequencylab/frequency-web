// ── Density-gated city landing data (GE11-2) ──────────────────────────────────
// The programmatic city pages at /discover/cities/<slug>. Unlike /discover/places
// (which lists any city with one public circle or event), THESE pages only render
// and only enter the sitemap when a city has crossed a real density threshold.
// Thin or empty city pages hurt SEO, so the honest-thinness gate is the whole
// point: a "seed" city with no momentum gets no programmatic landing page.
//
// The gate reads the existing density read-model: density_by_city() supplies the
// grounded per-city facts, scorePlace() turns each into a 0-100 readiness score +
// a stage (seed / growing / ready). We publish a city page at stage 'growing' or
// 'ready' (score >= GROWING_SCORE) and gate out 'seed'. The score is computed
// server-side (admin-gated RPC); the visitor-facing copy is built only from the
// city name + the same redaction-safe public circle/event lists the rest of
// /discover already exposes (city-level only, never a street, venue, or geo).

import {
  getDensitySignal,
  GROWING_SCORE,
  type DensityPlace,
} from '@/lib/analytics/density'
import {
  getPublicCircles,
  getPublicEvents,
  hasEventEnded,
  type PublicCircle,
  type PublicEvent,
} from '@/lib/discover'
import { citySlug, cityFromSlug } from '@/app/discover/events/_data'

/** The density score at or above which a city earns a programmatic landing page.
 *  Mirrors the read-model's 'growing'/'ready' stages; 'seed' stays out of crawl. */
export const CITY_PAGE_MIN_SCORE = GROWING_SCORE

/** One city that has cleared the density gate, with everything its page renders. */
export type DensityCity = {
  /** Display name, title-cased from the slug (the RPC normalizes to lowercase). */
  city: string
  /** URL slug, e.g. "encinitas". */
  slug: string
  /** The full density facts + score + stage (drives the copy + the gate). */
  density: DensityPlace
  /** Public circles in this city (city-level read; never a neighborhood/geo). */
  circles: PublicCircle[]
  /** Upcoming public events in this city (past ones filtered out). */
  events: PublicEvent[]
}

/** A light shape for the index grid + sitemap: just the slug, name, and score. */
export type DensityCitySummary = {
  city: string
  slug: string
  score: number
  stage: DensityPlace['stage']
}

/** Whether a scored city clears the density gate for a programmatic landing page.
 *  Pure + exported so the gate is unit-tested directly (no Supabase needed): a
 *  city is published only at/above CITY_PAGE_MIN_SCORE (the 'growing'/'ready'
 *  stages) AND only when its name resolves to a slug. A 'seed' city, or one whose
 *  RPC-normalized name is blank, never gets a page or a sitemap URL. */
export function cityClearsGate(place: Pick<DensityPlace, 'score' | 'city'>): boolean {
  return place.score >= CITY_PAGE_MIN_SCORE && !!place.city.trim()
}

// Pull the ranked density signal once and keep only the cities above threshold.
// Cached per request via React (each call is cheap; the signal is the slow read).
async function gatedPlaces(): Promise<DensityPlace[]> {
  const signal = await getDensitySignal()
  return signal.places.filter(cityClearsGate)
}

/** Every city above the density threshold, ranked by score. Backs the index +
 *  the sitemap, so only cities with real momentum ever advertise a landing page. */
export async function listDensityCities(): Promise<DensityCitySummary[]> {
  const places = await gatedPlaces()
  return places.map((p) => ({
    city: cityFromSlug(citySlug(p.city)),
    slug: citySlug(p.city),
    score: p.score,
    stage: p.stage,
  }))
}

/** One density-gated city by slug, with its public circles + upcoming events.
 *  Returns null when the city is below threshold (or unknown), so the route 404s
 *  rather than render a thin page. The circle/event lists come from the same
 *  redaction-safe public readers the rest of /discover uses. */
export async function getDensityCity(slug: string): Promise<DensityCity | null> {
  const want = citySlug(cityFromSlug(slug)) // normalize round-trip
  const places = await gatedPlaces()
  const place = places.find((p) => citySlug(p.city) === want)
  if (!place) return null

  const [allCircles, allEvents] = await Promise.all([
    getPublicCircles(200),
    getPublicEvents(200),
  ])
  const circles = allCircles.filter((c) => c.city && citySlug(c.city) === want)
  const events = allEvents.filter(
    (e) => e.city && citySlug(e.city) === want && !hasEventEnded(e),
  )

  return {
    city: cityFromSlug(want),
    slug: want,
    density: place,
    circles,
    events,
  }
}

export { citySlug, cityFromSlug }
