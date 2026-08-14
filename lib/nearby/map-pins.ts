import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { pointFromGeog } from '@/lib/events/geo'
import { formatEventDate } from '@/lib/utils'
import { collapseSeries, SERIES_COLUMNS, SERIES_WIDE_READ } from '@/lib/events/series'
import { approximatePoint } from '@/lib/maps/approximate'
import { locationCopy, moreDatesLine, memberCountLine } from '@/lib/maps/pin-copy'
import { withholdsAddress } from '@/lib/events/location-intent'
import type { MapPin } from '@/components/maps/types'

// THE AROUND YOU MAP'S PINS. One read per request, feeding components/nearby/nearby-map-header.tsx
// (the page's header band since ADR-1032; it was an in-body section before that).
//
// ── 🔴 WHAT THIS MAP LOOKED LIKE BEFORE THE 2026-08-13 AUDIT, MEASURED IN PRODUCTION ───────────
//
// It drew ten pins. Nine of them were the SAME EVENT.
//
//   | layer  | rows a member could reach | what the map drew                                    |
//   |--------|---------------------------|------------------------------------------------------|
//   | Event  | 20 rows = 5 gatherings    | 9 pins, all one weekly series, stacked on one corner |
//   | Circle | 7, of which 3 discoverable| 1                                                    |
//   | Space  | 20 active                 | 0, and no column existed to hold one                 |
//
// Three separate faults produced that, and all three are fixed here:
//
//   1. NO SERIES FOLD. Recurrence is MATERIALISED (ADR-007): an occurrence is a real `events` row,
//      and the cron keeps a 60-day horizon warm, so a weekly series is ~9 rows. Every other browse
//      surface collapses those to one card through lib/events/series.ts (ADR-897). This map never
//      did, so one cowork series painted nine identical pins on one coordinate and every other
//      gathering in the region was invisible underneath them.
//   2. `hide_address` EXCLUDED THREE OF THE FIVE GATHERINGS OUTRIGHT. See the next section.
//   3. SPACES HAD NOWHERE TO STORE A COORDINATE, while the map's empty state promised them. Fixed
//      by 20270301000000_space_location.sql (ADR-1026).
//
// ── WHY THE ADMIN CLIENT, AND WHAT THAT OBLIGES ────────────────────────────────────────────────
//
// This page already reads its events and circles through the service-role client (the counts, the
// "Coming up" band, the rails all do), and a map that disagreed with the list beside it about what
// exists would be its own bug. So: same client, and therefore RLS IS NOT BACKING ANY OF THIS UP.
// Every filter below is load-bearing with no safety net underneath it, which is exactly the
// situation `lib/nearby/map-pins.test.ts` was written for after this page shipped a leak.
//
// ── THE FILTERS, AND WHY EACH ONE IS THERE ─────────────────────────────────────────────────────
//
// EVENTS. The same four the page's own queries carry, and they are asserted in that page's test
// because the page shipped without three of them: `status='published'` (a draft is not announced),
// `visibility='public'` (circle_only and unlisted events are not discovery rows), `removed_at is
// null` (a moderator takedown stays taken down), plus not cancelled and in the future.
//
// AND ONE MORE, quieter: `is_demo`. Seeded demo events are not somewhere a member can turn up, and
// a map is the one surface that would put a fictional gathering on a real street corner.
//
// 🔴 `hide_address` IS NO LONGER AN EXCLUSION. IT IS A PRECISION. This is the one filter that
// changed on 2026-08-13, and it changed on the owner's explicit call, so the reasoning is worth
// keeping. A host can publish an event publicly and still withhold WHERE it is, and 10 of the 20
// upcoming rows had that flag set: Meld Cowork, Royal Reset Friday Float and the Vibe Check pool
// party, which is three of the community's five actual gatherings. Excluding them was defensible in
// isolation and indefensible in aggregate, because it left a map of a community showing one event.
//
// So they are drawn, coarsened. lib/maps/approximate.ts QUANTISES the point to a ~1 km grid cell
// before it is published, which is not the same thing as offsetting it: a deterministic offset is a
// reversible encoding of the true coordinate (the algorithm is in this repo and the row id is in the
// URL), whereas a snap to a grid destroys the sub-cell information for good. The popup says the area
// is approximate and that the host shares the address on RSVP, which is what those events already
// say in their own venue lines ("Royal Temple - RSVP for Address"). The map now agrees with them
// instead of pretending they do not exist.
//
// CIRCLES. ADR-1015's two axes. A pin is a DISCOVERY row, so the question is `canSeeCircle`, and
// the LISTED set is the honest answer for a mixed audience: `unlisted = false` and
// `status in ('forming','active')`. A listed-but-CLOSED circle still earns its pin, deliberately —
// that is the lead funnel ADR-1015 exists to express, and its name and place are public face. An
// unlisted one must never appear, and neither must a demo. A Circle's coordinate is a pin its host
// placed by hand, so there is no precision question: placing it IS the consent.
//
// SPACES (ADR-1026, new). `status='active'` and `visibility='network'`. `unlisted` is deliberately
// excluded and it is the same distinction ADR-1015 draws for Circles: an unlisted Space is readable
// by direct link, which makes it VISIBLE, not DISCOVERABLE, and a pin is a discovery row. `private`
// is never a question. A Space with no coordinate simply has none: the columns start NULL, so
// appearing on the map is something an owner opts into by placing a pin, never a default.

/** Pins per layer AFTER folding. Well above today's volumes; a ceiling, not a filter. Nothing on
 *  this page is worth a slow map: the clustering in lib/maps/cluster.ts handles density fine, but
 *  the payload still crosses the wire. */
const PER_LAYER_CAP = 300

/**
 * ROWS the event layer READS, before the series fold runs.
 *
 * 🔴 THIS HAS TO BE BIGGER THAN THE DISPLAY CAP, and the reason is the trap lib/events/series.ts
 * names: a post-query fold spends the query LIMIT on rows it then discards. One daily series can
 * occupy 61 rows of the budget on its own, so reading PER_LAYER_CAP rows and folding them could
 * hand the map five gatherings out of a region that has fifty. SERIES_WIDE_READ is the shared
 * constant for exactly this shape (a global cap on the community's whole upcoming set, not a
 * display count), so this map uses it rather than inventing a second number.
 */
const EVENT_ROW_CAP = SERIES_WIDE_READ

/** One decoded pin's worth of an event row. `hide_address` and the three series columns are
 *  SELECTED, not just filtered on, because both now change what the pin says. */
type EventRow = {
  id: string
  slug: string | null
  title: string | null
  starts_at: string
  location: string | null
  venue_name: string | null
  city: string | null
  geog: unknown
  hide_address: boolean | null
  street: string | null
  region: string | null
  cover_image_path: string | null
  recurrence_type: string | null
  recurrence_until: string | null
  parent_event_id: string | null
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
  image_url: string | null
}

type SpaceRow = {
  id: string
  slug: string | null
  name: string | null
  brand_name: string | null
  tagline: string | null
  street: string | null
  city: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  location_precision: string | null
  cover_image_url: string | null
  brand_logo_url: string | null
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
 * A cover photo's public URL, or null.
 *
 * Event covers live in the public `event-media` bucket, the same one the event page reads;
 * `getPublicUrl` is a local string build, not a round-trip, so this costs nothing per row. Fail-safe
 * to no image: the popup card then renders without its header band, which is a cosmetic loss and
 * never a broken card.
 */
function eventCoverUrl(
  admin: ReturnType<typeof createAdminClient>,
  path: string | null,
): string | null {
  if (!path) return null
  try {
    return admin.storage.from('event-media').getPublicUrl(path).data?.publicUrl ?? null
  } catch {
    return null
  }
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

    const [eventsRes, circlesRes, spacesRes] = await Promise.all([
      admin
        .from('events')
        .select(
          `id, slug, title, starts_at, location, venue_name, street, city, region, geog, hide_address, cover_image_path, ${SERIES_COLUMNS}`,
        )
        .eq('status', 'published')
        .eq('visibility', 'public')
        .is('removed_at', null)
        .eq('is_cancelled', false)
        .gte('starts_at', nowIso)
        // Seeded demo content is not somewhere a member can actually turn up. Every other event
        // read in the app carries this (lib/events/store.ts filters it on all four of its queries)
        // and the other two layers below carry it or have no demo axis, so the map would have been
        // the one surface that put a fictional gathering on a real street corner.
        .eq('is_demo', false)
        .not('geog', 'is', null)
        .order('starts_at', { ascending: true })
        .limit(EVENT_ROW_CAP),
      admin
        .from('circles')
        .select('id, slug, name, city, neighborhood, member_count, latitude, longitude, image_url')
        .eq('unlisted', false)
        .in('status', ['forming', 'active'])
        .eq('is_demo', false)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('member_count', { ascending: false })
        .limit(PER_LAYER_CAP),
      admin
        .from('spaces')
        .select('id, slug, name, brand_name, tagline, street, city, region, latitude, longitude, location_precision, cover_image_url, brand_logo_url')
        .eq('status', 'active')
        // Network-visible only. An `unlisted` Space is reachable by direct link, which makes it
        // visible and NOT discoverable, and a pin is a discovery row (the ADR-1015 distinction).
        .eq('visibility', 'network')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('name', { ascending: true })
        .limit(PER_LAYER_CAP),
    ])

    const pins: MapPin[] = []

    // ── EVENTS: fold the series FIRST, then draw one pin per gathering ────────────────────────
    //
    // The fold runs over the rows the database returned, in the order it returned them (earliest
    // first), and elects the EARLIEST row present as each series' representative. That election is
    // the one that survives a series' anchor ageing out of the window, which is the trap
    // lib/events/series.ts exists to hold: filtering `starts_at >= now` deletes the anchor row of
    // every established series, so electing "the anchor" would delete every established series from
    // this map instead of collapsing it.
    //
    // `dropCancelled: false` because the query already excluded cancelled rows, and asking the fold
    // to re-check a field this SELECT does not fetch would silently drop every group.
    const eventRows = (eventsRes.data ?? []) as EventRow[]
    const folded = collapseSeries(eventRows, { perSeries: 1, dropCancelled: false })

    for (const row of folded.rows.slice(0, PER_LAYER_CAP)) {
      // `geog` arrives as an EWKB hex string OR a GeoJSON object depending on how PostgREST feels
      // about the column; `pointFromGeog` is the SHIPPED decoder that handles both, and it is what
      // the event detail and edit pages already use. I wrote a second one that handled only the hex
      // form before finding it, which would have silently emptied this map the day PostgREST
      // returned the other shape. One decoder, or they drift.
      const truePoint = pointFromGeog(row.geog)
      if (!truePoint || !row.slug || !row.title) continue

      // 🔴 THE COARSENING, AND THE ONLY PLACE IT HAPPENS FOR EVENTS. A host who set `hide_address`
      // gets a grid cell, never the coordinate. `approximatePoint` returns null for anything that
      // is not a real lat/lng, and null means NO PIN: a row that cannot be coarsened must not fall
      // back to the exact point, which is the one mistake in this file that would be a leak.
      // 🔴 THE FLAG **OR** THE HOST'S OWN WORDS (ADR-1028). Production had an event with
      // `hide_address = false` and a location line reading "The Royal Temple (RSVP to see location)":
      // the host said the address is withheld in the only field they were looking at, and the flag
      // that controls it said the opposite. The one reason it had not already published Royal
      // Temple's door is that the note also broke its geocode, so it had no point to publish. A bug
      // prevented by a second bug is not prevented, so this reads BOTH signals and coarsens on
      // either. Fails safe: a false positive costs a member some precision, a false negative
      // publishes an address a host meant to keep, and those are not symmetric.
      const hidden = row.hide_address === true || withholdsAddress(row.location)
      const point = hidden ? approximatePoint(truePoint.lat, truePoint.lng, row.id) : truePoint
      if (!point) continue

      const group = folded.byRowId.get(row.id)
      // dateCount counts the series' eligible dates; this pin IS one of them, so the rest is the
      // "+N more" the popup and the map bubble both speak from.
      const moreCount = Math.max(0, (group?.dateCount ?? 1) - 1)

      // 🔴 EXACT SHOWS THE ADDRESS, APPROXIMATE SHOWS THE CITY AND A PILL. One decision, made in
      // lib/maps/pin-copy.ts for every layer, so the map cannot say it two ways in one sentence.
      // Note what is NOT passed at approximate precision: no `venue_name` and no `location`. A venue
      // name is often an address in disguise ("Royal Temple" is one building in Vista), and
      // `location` is free text a host may well have typed a street into. Coarsening the dot and
      // publishing the address beside it would be worse than not coarsening at all, because it
      // looks careful.
      const { line: where, badge } = locationCopy(
        hidden
          ? { city: row.city, region: row.region }
          : { venueName: row.venue_name, street: row.street ?? row.location, city: row.city },
        { approximate: hidden, kind: 'event' },
      )

      pins.push({
        // Prefixed: two layers can hold the same uuid, and the seam keys markers on `id`.
        id: `event:${row.id}`,
        lat: point.lat,
        lng: point.lng,
        kind: 'event',
        title: row.title,
        // WHEN on one row, WHERE on the next. Joining them is what produced the run-on line the
        // owner screenshotted, and a card reads them as two different questions anyway.
        subtitle: [pinDate(row.starts_at), moreDatesLine(moreCount)].filter(Boolean).join(' · ') || null,
        detail: where,
        badge,
        imageUrl: eventCoverUrl(admin, row.cover_image_path),
        href: `/events/${row.slug}`,
        hrefLabel: moreCount > 0 ? 'See the event and its dates' : 'See the event',
        label: row.title,
        // What turns this spot into a `1+` bubble instead of a plain pin (lib/maps/cluster.ts).
        moreCount,
        // So the legend can say some dots are areas, not just the popup of the one dot tapped.
        approximate: hidden,
      })
    }

    for (const c of (circlesRes.data ?? []) as CircleRow[]) {
      if (c.latitude == null || c.longitude == null || !c.slug || !c.name) continue
      // A Circle's coordinate is a pin its host placed by hand, or the centroid of the city they
      // typed, so there is no precision question to ask: `circles` carries no street column, and
      // neighbourhood-or-city is the sharpest thing it could say even if it wanted to.
      pins.push({
        id: `circle:${c.id}`,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        kind: 'circle',
        title: c.name,
        subtitle: memberCountLine(c.member_count ?? 0),
        detail: c.neighborhood ?? c.city ?? null,
        imageUrl: c.image_url?.trim() || null,
        href: `/circles/${c.slug}`,
        hrefLabel: 'See the circle',
        label: c.name,
      })
    }

    for (const s of (spacesRes.data ?? []) as SpaceRow[]) {
      if (s.latitude == null || s.longitude == null || !s.slug) continue
      const name = s.brand_name?.trim() || s.name?.trim()
      if (!name) continue

      // 🔴 THE OWNER'S PRECISION SETTING, OBEYED ON THE READ PATH. The table holds the TRUE point so
      // the owner can drag their pin and have it stay dragged (20270301000000_space_location.sql
      // explains why it must); this is the single place that decides what the public sees. Anything
      // that reads spaces.latitude and publishes it without passing through here is a leak.
      const approximate = s.location_precision === 'approximate'
      const point = approximate
        ? approximatePoint(Number(s.latitude), Number(s.longitude), s.id)
        : { lat: Number(s.latitude), lng: Number(s.longitude) }
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue

      // Same rule as the event layer, from the same module: exact publishes the address, approximate
      // publishes the city and wears the pill that says so.
      const { line: where, badge } = locationCopy(
        approximate
          ? { city: s.city, region: s.region }
          : { street: s.street, city: s.city, region: s.region },
        { approximate, kind: 'space' },
      )

      pins.push({
        id: `space:${s.id}`,
        lat: point.lat,
        lng: point.lng,
        kind: 'space',
        title: name,
        subtitle: s.tagline?.trim() || null,
        detail: where,
        badge,
        // The cover if the Space has one, else the brand logo. A logo on a transparent PNG sits on
        // the card's own surface token rather than the basemap (see popup-content.ts).
        imageUrl: s.cover_image_url?.trim() || s.brand_logo_url?.trim() || null,
        href: `/spaces/${s.slug}`,
        hrefLabel: 'See the space',
        label: name,
        approximate,
      })
    }

    return pins
  } catch {
    return []
  }
})
