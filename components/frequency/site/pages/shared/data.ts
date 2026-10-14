// THE REAL DATA BEHIND THE DESIGN'S SAMPLES (site pages, lane A).
//
// The design's Home, People and Spaces pages are written around sample data: Bird Rock / San Diego,
// "48 Circles and events this week", "212 people checked in", ten invented events and six invented
// Spaces with Leaflet coordinates (templates/website/web/eventmap.js `EV` / `SP`). None of that ships.
// Every figure these bodies paint comes from a loader that already feeds a public surface:
//
//   upcoming events  public_events, folded one per series exactly as lib/discover getPublicEvents does
//   active Circles   public_active_circle_count     (the same RPC lib/page-editor/live-data reads)
//   ranked Spaces    lib/spaces/discovery listNetworkedSpaces({ sort: 'standing' })  (the directory order)
//
// A read that fails returns `ok: false` and the body OMITS the figure. It never paints a 0 that only
// means "the query broke" (the trap `readLive` in components/marketing/blocks.tsx exists to prevent).
//
// STATIC ON PURPOSE: nothing here reads cookies, headers or searchParams, so the routes that call it
// keep their ISR `revalidate` (docs/DEPLOY-SAFETY.md). Public events carry a CITY only, never a
// coordinate (20240211000000_public_discover_reads.sql), so the map beside the list pins each CITY at
// its centroid (lib/maps/city-centroids.ts, ./map-pins.ts), never a venue.

import type { PublicEvent } from '@/lib/discover'
import { collapseSeriesRows, seriesFetchLimit, seriesUpcomingFloor, TEASER_CARDS_PER_SERIES } from '@/lib/events/series'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { createPublicClient } from '@/lib/supabase/public'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import type { FqIconName } from '@/components/frequency/icon'

export interface SiteEvent {
  id: string
  href: string
  title: string
  /** "Thu 7:00pm", in the event's own wall clock (the stored UTC parts, see lib/utils). */
  when: string
  /** The Circle it belongs to, else the city, else nothing. */
  where: string | null
  /** The event's city, the only place a public event may be pinned (at the city's centroid). */
  city: string | null
  icon: FqIconName
  /** The pill on the right: the price posture, never an invented "4 spots left". */
  tag: string
}

export interface SiteSpace {
  id: string
  href: string
  name: string
  /** "Encinitas · Studio" */
  where: string
  city: string | null
  /** The pill: upcoming gatherings when the read delivered a count, else the Space's kind. */
  tag: string
  rank: number
}

export interface WhatsOn {
  ok: boolean
  events: SiteEvent[]
  /** The city most upcoming events are in, or null. Stands in for the design's "San Diego". */
  city: string | null
  /** Upcoming events (one per series) starting in the next seven days. */
  thisWeek: number
}

/** "Thu 7:00pm". `timeZone: 'UTC'` is load-bearing: starts_at stores the host's wall clock as UTC
 *  parts (lib/utils, "Event date formatting"), so formatting in any other zone moves the hour. */
export function eventWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .replace(/\s?(AM|PM)$/i, (_, m: string) => m.toLowerCase())
  return `${day} ${time}`
}

function toSiteEvent(e: PublicEvent): SiteEvent {
  const paid = (e.price_cents ?? 0) > 0
  return {
    id: e.id,
    href: `/events/${e.slug}`,
    title: e.title,
    when: eventWhen(e.starts_at),
    where: e.circle_name ?? e.city ?? null,
    city: e.city ?? null,
    icon: e.circle_id ? 'circle' : 'event',
    tag: paid ? 'Tickets' : 'Free',
  }
}

/** The most common non-empty value, or null. Ties go to the first seen (the soonest event). */
function mode(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  let best: string | null = null
  let bestN = 0
  for (const v of values) {
    const k = v?.trim()
    if (!k) continue
    const n = (counts.get(k) ?? 0) + 1
    counts.set(k, n)
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

/** Add `days` to a YYYY-MM-DD day string, staying in calendar days. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The /discover read (lib/discover getPublicEvents), with its outcome kept. getPublicEvents folds a
 *  failed RPC into `[]`, which is right for a directory and wrong here: "nothing on the calendar" is a
 *  claim, and a broken query must not make it. Same RPC, same series fold, same upcoming floor. */
async function readUpcomingEvents(limit: number): Promise<PublicEvent[] | null> {
  const { data, error } = await createPublicClient().rpc('public_events', { _limit: seriesFetchLimit(limit) })
  if (error) return null
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  return collapseSeriesRows((data ?? []) as PublicEvent[], {
    upcomingFrom: floor,
    perSeries: TEASER_CARDS_PER_SERIES,
  }).slice(0, limit)
}

export async function getWhatsOn(limit = 12): Promise<WhatsOn> {
  try {
    const rows = await readUpcomingEvents(Math.max(limit, 24))
    if (!rows) return { ok: false, events: [], city: null, thisWeek: 0 }
    const today = dayInZone(new Date(), HOME_TZ)
    const weekEnd = addDays(today, 7)
    const thisWeek = rows.filter((e) => {
      const day = e.starts_at.slice(0, 10)
      return day >= today && day < weekEnd
    }).length
    return {
      ok: true,
      events: rows.slice(0, limit).map(toSiteEvent),
      city: mode(rows.map((e) => e.city)),
      thisWeek,
    }
  } catch {
    return { ok: false, events: [], city: null, thisWeek: 0 }
  }
}

/** Active Circles on the network, or null when the read did not deliver. */
export async function getActiveCircleCount(): Promise<number | null> {
  try {
    const { data, error } = await createPublicClient().rpc('public_active_circle_count')
    if (error || typeof data !== 'number') return null
    return data
  } catch {
    return null
  }
}

export interface RankedSpaces {
  ok: boolean
  spaces: SiteSpace[]
  city: string | null
}

/** The directory's top Spaces by STANDING (earned, never bought, LIVE-262). */
export async function getRankedSpaces(limit = 6): Promise<RankedSpaces> {
  try {
    const all = await listNetworkedSpaces({ sort: 'standing' })
    const spaces = all.slice(0, limit).map(
      (s, i): SiteSpace => ({
        id: s.id,
        href: `/spaces/${s.slug}`,
        name: s.name,
        where: [s.city, s.kindLabel].filter(Boolean).join(' · '),
        city: s.city ?? null,
        tag: s.upcomingEventCount && s.upcomingEventCount > 0 ? `${s.upcomingEventCount} upcoming` : s.kindLabel,
        rank: i + 1,
      }),
    )
    return { ok: true, spaces, city: mode(all.map((s) => s.city)) }
  } catch {
    return { ok: false, spaces: [], city: null }
  }
}
