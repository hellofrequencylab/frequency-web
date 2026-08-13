import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { pointFromGeog } from '@/lib/events/geo'
import { formatEventDate } from '@/lib/utils'
import type { MapPin } from '@/components/maps/types'

// THE AROUND YOU MAP'S PINS. One read per request, feeding components/nearby/nearby-map.tsx.
//
// ── 🔴 WHAT CAN AND CANNOT BE MAPPED, MEASURED IN PRODUCTION 2026-08-13 ─────────────────────────
//
// The owner asked for four layers: Events, Circles, Spaces, Places. Two of them have nowhere to
// store a coordinate, so they are not "not built yet", they are not buildable without a migration:
//
//   | layer  | coordinates                     | mappable rows today |
//   |--------|---------------------------------|---------------------|
//   | Event  | `events.geog` (PostGIS)         | 9                   |
//   | Circle | `circles.latitude/longitude`    | 1                   |
//   | Space  | 🔴 NO COLUMN EXISTS on `spaces` | n/a                 |
//   | Place  | 🔴 `outposts` is id/name/slug/region_id/created_at, no geometry | n/a |
//
// Adding either means a migration, a geocoding path, and operator UI to enter an address. That is
// a real piece of work and it is recorded here rather than faked with an empty layer, because a
// legend row for a layer that can never have pins is a lie the map tells every visitor.
//
// The two live layers are wired so a third is a small edit: one more `push`, one more `kind`.
//
// ── WHY THE ADMIN CLIENT, AND WHAT THAT OBLIGES ────────────────────────────────────────────────
//
// This page already reads its events and circles through the service-role client (the counts, the
// "Coming up" band, the rails all do), and a map that disagreed with the list beside it about what
// exists would be its own bug. So: same client, and therefore RLS IS NOT BACKING ANY OF THIS UP.
// Every filter below is load-bearing with no safety net underneath it, which is exactly the
// situation `app/(main)/nearby/page.test.ts` was written for after the same page shipped a leak.
//
// ── THE FILTERS, AND WHY EACH ONE IS THERE ─────────────────────────────────────────────────────
//
// EVENTS. The same four the page's own queries carry, and they are asserted in that page's test
// because the page shipped without three of them: `status='published'` (a draft is not announced),
// `visibility='public'` (circle_only and unlisted events are not discovery rows), `removed_at is
// null` (a moderator takedown stays taken down), plus not cancelled and in the future.
//
// 🔴 AND ONE MORE THE LIST DOES NOT NEED: `hide_address`. A host can publish an event publicly and
// still withhold WHERE it is, and 10 of the 19 otherwise-mappable upcoming events have that flag
// set. The list beside this map shows those events and is right to: the title and the time are
// public. A PIN IS THE ADDRESS. Dropping a coordinate a host deliberately hid, onto a public map,
// would be the worst kind of leak in this file, so `hide_address` events are excluded outright
// rather than fuzzed. Fuzzing is a judgement call about how much precision is safe, and that is an
// owner's call, not a default.
//
// AND ONE MORE, quieter: `is_demo`. Seeded demo events are not somewhere a member can turn up, and
// a map is the one surface that would put a fictional gathering on a real street corner. The circle
// layer already carried it; the event layer did not.
//
// CIRCLES. ADR-1015's two axes. A pin is a DISCOVERY row, so the question is `canSeeCircle`, and
// the LISTED set is the honest answer for a mixed audience: `unlisted = false` and
// `status in ('forming','active')`. A listed-but-CLOSED circle still earns its pin, deliberately —
// that is the lead funnel ADR-1015 exists to express, and its name and place are public face. An
// unlisted one must never appear, and neither must a demo.

/** Nothing on this page is worth a slow map. The clustering in lib/maps/cluster.ts handles density
 *  fine, but the payload still crosses the wire, so the read is capped per layer. Well above
 *  today's volumes; a ceiling, not a filter. */
const PER_LAYER_CAP = 300

/** One decoded pin's worth of an event row. */
type EventRow = {
  id: string
  slug: string | null
  title: string | null
  starts_at: string
  location: string | null
  venue_name: string | null
  city: string | null
  geog: unknown
}

type CircleRow = {
  id: string
  slug: string | null
  name: string | null
  city: string | null
  neighborhood: string | null
  member_count: number | null
  latitude: number | null
  longitude: number | null
}

/**
 * A short, plain date for a pin's second line ("Fri, Jun 24"). No em dashes, no narrated feelings.
 *
 * 🔴 DELEGATES to the shared `formatEventDate` rather than calling `toLocaleDateString` here, and
 * that is load-bearing, not tidiness. `events.starts_at` holds the host's wall-clock kept as UTC
 * PARTS (lib/time/zone.ts), so a formatter without an explicit `timeZone: 'UTC'` resolves in the
 * RUNTIME's zone and flips the day for any stored hour under the viewer's UTC offset. That exact
 * bug shipped once already, printing three different dates for one event across the ⌘K overlay,
 * /search and the event page (see the note above `formatEventDate` in lib/utils.ts). A pin's date
 * line has to agree with the card beside it, so it uses the same helper the card does.
 */
function pinDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatEventDate(iso)
}

/**
 * Every pin the Around You map should draw, for anyone. Request-memoized (the `cache()` idiom from
 * lib/circles/store.ts), so the page may call it beside its other reads without paying twice.
 *
 * Returns an empty array rather than throwing on any failure. A map is an enhancement on this page;
 * it must never be the reason the page 500s.
 */
export const loadNearbyMapPins = cache(async (): Promise<MapPin[]> => {
  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const [eventsRes, circlesRes] = await Promise.all([
      admin
        .from('events')
        .select('id, slug, title, starts_at, location, venue_name, city, geog')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .is('removed_at', null)
        .eq('is_cancelled', false)
        .gte('starts_at', nowIso)
        // The pin IS the address, so an event whose host hid it gets no pin. See the header.
        .eq('hide_address', false)
        // Seeded demo content is not somewhere a member can actually turn up. Every other event
        // read in the app carries this (lib/events/store.ts filters it on all four of its queries)
        // and the circle layer below carries it, so the map would have been the one surface that
        // put a fictional gathering on a real street corner. No demo event is upcoming today, which
        // is exactly why this had to be written now rather than after one is seeded.
        .eq('is_demo', false)
        .not('geog', 'is', null)
        .order('starts_at', { ascending: true })
        .limit(PER_LAYER_CAP),
      admin
        .from('circles')
        .select('id, slug, name, city, neighborhood, member_count, latitude, longitude')
        .eq('unlisted', false)
        .in('status', ['forming', 'active'])
        .eq('is_demo', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('member_count', { ascending: false })
        .limit(PER_LAYER_CAP),
    ])

    const pins: MapPin[] = []

    for (const e of (eventsRes.data ?? []) as EventRow[]) {
      // `geog` arrives as an EWKB hex string OR a GeoJSON object depending on how PostgREST feels
      // about the column; `pointFromGeog` is the SHIPPED decoder that handles both, and it is what
      // the event detail and edit pages already use. I wrote a second one that handled only the hex
      // form before finding it, which would have silently emptied this map the day PostgREST
      // returned the other shape. One decoder, or they drift.
      const point = pointFromGeog(e.geog)
      if (!point || !e.slug || !e.title) continue
      const where = e.venue_name ?? e.location ?? e.city ?? null
      pins.push({
        // Prefixed: two layers can hold the same uuid, and the seam keys markers on `id`.
        id: `event:${e.id}`,
        lat: point.lat,
        lng: point.lng,
        kind: 'event',
        title: e.title,
        subtitle: [pinDate(e.starts_at), where].filter(Boolean).join(' · ') || null,
        href: `/events/${e.slug}`,
        hrefLabel: 'See the event',
        label: e.title,
      })
    }

    for (const c of (circlesRes.data ?? []) as CircleRow[]) {
      if (c.latitude == null || c.longitude == null || !c.slug || !c.name) continue
      const count = c.member_count ?? 0
      const where = c.neighborhood ?? c.city ?? null
      pins.push({
        id: `circle:${c.id}`,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        kind: 'circle',
        title: c.name,
        subtitle:
          [`${count} ${count === 1 ? 'member' : 'members'}`, where].filter(Boolean).join(' · ') ||
          null,
        href: `/circles/${c.slug}`,
        hrefLabel: 'See the circle',
        label: c.name,
      })
    }

    return pins
  } catch {
    return []
  }
})
