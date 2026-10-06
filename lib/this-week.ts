// "THIS WEEK IN <REGION>" (LIVE-806, ADR-1720 workstream 9). A Thursday email built from live public
// Events in a launch region, sent to the members who live there. The launch is density, so this is
// the one place a member sees everything real near them in the next seven days, not only what they
// already said yes to (that is the Sunday digest, lib/digest.ts).
//
// Pure here (the region match, the pick, the keys); the cron reads and sends
// (app/api/cron/this-week/route.ts). Region by CITY NAME, the field events and profiles share,
// because no region column exists on either.

/** Nothing sends before this day. Marketing starts the Thursday email on 3 December 2026; until
 *  then the cron builds and logs the reading only (a dry run every Thursday). */
export const THIS_WEEK_SENDS_FROM = '2026-12-03'

export interface LaunchRegion {
  slug: string
  name: string
  /** City names in the region, lowercased. */
  cities: readonly string[]
}

/** The launch regions. North County San Diego first (ADR-1720); add one by adding a row. */
export const LAUNCH_REGIONS: readonly LaunchRegion[] = [
  {
    slug: 'north-county',
    name: 'North County',
    cities: [
      'carlsbad',
      'encinitas',
      'leucadia',
      'cardiff',
      'cardiff by the sea',
      'oceanside',
      'vista',
      'san marcos',
      'escondido',
      'solana beach',
      'del mar',
      'rancho santa fe',
      'fallbrook',
      'valley center',
      'bonsall',
      'north county',
    ],
  },
]

/** At most this many Events in one email: a week at a glance, not a catalogue. */
export const THIS_WEEK_MAX_EVENTS = 8

/** Lowercased city with any ", CA" / ", California, USA" tail dropped, so "Carlsbad, CA" matches. */
export function cityKey(city: string | null | undefined): string {
  return (city ?? '').split(',')[0].trim().toLowerCase()
}

export function regionForCity(city: string | null | undefined): LaunchRegion | null {
  const key = cityKey(city)
  if (!key) return null
  return LAUNCH_REGIONS.find((r) => r.cities.includes(key)) ?? null
}

export interface ThisWeekEventRow {
  slug: string
  title: string
  city: string | null
  starts_at: string
  is_cancelled?: boolean | null
}

/** The region's public Events starting in the next 7 days, soonest first, capped. */
export function pickThisWeek<T extends ThisWeekEventRow>(events: T[], region: LaunchRegion, now: Date): T[] {
  const from = now.getTime()
  const until = from + 7 * 24 * 60 * 60 * 1000
  return events
    .filter((e) => !e.is_cancelled && regionForCity(e.city)?.slug === region.slug)
    .filter((e) => {
      const at = Date.parse(e.starts_at)
      return Number.isFinite(at) && at >= from && at < until
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, THIS_WEEK_MAX_EVENTS)
}

/** ISO-8601 week label (`2026-W49`), UTC. One email per member per region per week. */
export function isoWeekOf(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The outbox dedupe key: a second run in the same week enqueues nothing new (SCAN-611). */
export function thisWeekDedupeKey(regionSlug: string, profileId: string, at: Date): string {
  return `this-week:${regionSlug}:${isoWeekOf(at)}:${profileId}`
}

/** True on and after the send-from day. Before it the cron is a dry run. */
export function thisWeekSendsOpen(now: Date): boolean {
  return now.toISOString().slice(0, 10) >= THIS_WEEK_SENDS_FROM
}
