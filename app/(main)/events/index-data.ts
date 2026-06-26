// The /events index data layer. Everything the Events Catalog needs — operator
// content, the viewer's scope (circles + home geocell + role flags), the hybrid
// circle+public event union, RSVP counts, the faceted + sorted card list, the map
// pins, and the For-You gate — assembled in ONE place so the page just renders it.
// Pure server read; extracted verbatim from app/(main)/events/page.tsx so behavior
// is unchanged (mirrors lib/circles/index-data.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { nearbyEvents } from '@/lib/events/geocode'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { resolvePageContent } from '@/lib/page-content'
import type { CatalogFacet } from './events-filter-bar'
import type { SortOption } from './events-sort'
import type { EventMapPin } from '@/components/events/events-map'

export type EventRow = {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean
  is_demo: boolean
  /** Operator-Featured (events.featured_at) — badge it as a curated pick. */
  featured_at?: string | null
  scope_id: string
  scope_type: string
  // P0 taxonomy + capacity + geo + price (newer than the generated DB types —
  // read via the untyped-client cast, the repo convention for not-yet-regenerated
  // columns; see lib/events/geocode.ts, capacity.ts, matching.ts).
  category: string | null
  energy_tag: string | null
  capacity: number | null
  attendance_mode: string | null
  price_cents: number | null
  cover_image_path: string | null
  // Set on standalone public events surfaced by the nearby union (ADR-254): the
  // distance from the viewer's fuzzed home to the EVENT's own geocoded point, in
  // metres. Circle events leave this null (their distance is circle-anchored).
  distance_m?: number | null
  // True for events surfaced by the public-nearby union, not the viewer's circles
  // (ADR-254). Drives the `Public` provenance chip on the card.
  is_public_standalone?: boolean
  host: { id: string; display_name: string; handle: string } | null
}

// Library taxonomy (events.category) — the discovery facet, Eventbrite-style.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'movement', label: 'Movement' },
  { value: 'circle_ritual', label: 'Circle ritual' },
  { value: 'learning', label: 'Learning' },
  { value: 'social', label: 'Social' },
  { value: 'service', label: 'Service' },
  { value: 'external_meetup', label: 'External meetup' },
  { value: 'retreat', label: 'Retreat' },
  { value: 'online', label: 'Online' },
  { value: 'gathering', label: 'Gathering' },
]

// Attendance mode (events.attendance_mode) — the Format facet (EVENTS-DESIGN §3.2).
const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'in_person', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'In person + online' },
]

// Date-range bands (EVENTS-DESIGN §3.2). Resolved server-side to a starts_at
// window against `now`, so the result stays shareable and honest.
const DATE_OPTIONS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'month', label: 'This month' },
]

// Price (events.price_cents; NULL or 0 = free, >0 = paid). Two honest buckets.
const PRICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
]

// Nervous-system framing (events.energy_tag) — matches the DB check constraint.
const ENERGY_OPTIONS: { value: string; label: string }[] = [
  { value: 'grounding', label: 'Grounding' },
  { value: 'high_activation', label: 'High activation' },
  { value: 'social', label: 'Social' },
  { value: 'ceremonial', label: 'Ceremonial' },
]

// "Has spots" — the only real scarcity signal: capacity IS NULL (unlimited) OR
// fewer 'going' than capacity. One option toggles the facet on/off via the URL.
const SPOTS_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Has open spots' },
]

// Distance bands measured from the viewer's privacy-fuzzed home geocell (~1.1km
// grid, ADR-186 — never an exact coordinate). For standalone public events the
// distance is viewer → EVENT's own geocoded point (the nearby_events RPC); for
// circle events it falls back to viewer → hosting circle. Only shown when the
// viewer has a home location set.
const NEAR_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
]

// Sort menu (EVENTS-DESIGN §3.2). Distance only when a home location is set;
// Relevance only when a search is active — both gated in the page below.
const SORT_DATE: SortOption = { value: 'date', label: 'Soonest' }
const SORT_DISTANCE: SortOption = { value: 'distance', label: 'Nearest' }
const SORT_POPULARITY: SortOption = { value: 'popularity', label: 'Most going' }
const SORT_RELEVANCE: SortOption = { value: 'relevance', label: 'Best match' }

// Great-circle distance in km (haversine) — good enough for banded facets.
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Resolve a Date-range facet value to an inclusive [from, to] starts_at window.
// Returns null bounds when the facet is off (the page's default 60-day horizon
// then applies). All maths is local to the passed `now` so it stays a pure helper.
function dateRangeWindow(value: string | undefined, now: Date): { from: Date; to: Date } | null {
  if (!value) return null
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  if (value === 'today') return { from: startOfDay, to: endOfDay(startOfDay) }
  if (value === 'week') {
    // Through the end of the current week (Sunday-based, matching the locale grid).
    const dow = startOfDay.getDay() // 0 = Sun
    const end = new Date(startOfDay)
    end.setDate(startOfDay.getDate() + (6 - dow))
    return { from: startOfDay, to: endOfDay(end) }
  }
  if (value === 'weekend') {
    // Saturday + Sunday of the current week.
    const dow = startOfDay.getDay()
    const sat = new Date(startOfDay)
    sat.setDate(startOfDay.getDate() + ((6 - dow + 7) % 7))
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    // If today is already the weekend, start from today, not next Saturday.
    const from = dow === 0 || dow === 6 ? startOfDay : sat
    return { from, to: endOfDay(sun) }
  }
  if (value === 'month') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: startOfDay, to: endOfDay(end) }
  }
  return null
}

// Relative "when" — "Tomorrow at 3pm" / "Friday at 3pm" / "Jun 24 at 3pm".
// `now` is passed in so this stays a pure helper (no clock read at render).
export function formatWhen(iso: string, now: Date) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    d.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' }
  const time = d.toLocaleTimeString('en-US', opts).replace(' ', '').toLowerCase()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(now)) / (24 * 60 * 60 * 1000))
  if (days === 0) return `Today at ${time}`
  if (days === 1) return `Tomorrow at ${time}`
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
}

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
export const CONTENT_FALLBACK = {
  title: 'Events',
  description:
    'Group rides, gatherings, and meetups your circles are running near you. RSVP to see who’s coming, show up, and earn zaps for every one you make.',
}

export interface EventsIndexParams {
  q?: string
  category?: string
  format?: string
  date?: string
  price?: string
  energy?: string
  spots?: string
  near?: string
  sort?: string
}

export interface EventsIndexData {
  /** Operator-editable header content (ADR-180), falling back to the coded defaults. */
  content: {
    title: string
    description: string
    heroImage: string | null
    ctaLabel: string | null
    ctaHref: string | null
  }
  /** Resolved `now` — passed to the card + For-You lane so render does no clock read. */
  nowDate: Date
  myProfileId: string | null
  myCircles: { id: string; name: string }[]
  isCrew: boolean
  isHost: boolean
  /** The viewer's RSVP'd events (sorted), the soonest-first remainder, and the map pins. */
  goingEvents: EventRow[]
  sortedEvents: EventRow[]
  mapPins: EventMapPin[]
  circleNames: Record<string, string>
  coverUrls: Record<string, string>
  rsvpCounts: Record<string, number>
  myRsvps: Set<string>
  /** Empty-state branching: any active facet, and whether the viewer has any scope. */
  filtering: boolean
  hasAnyScope: boolean
  /** Whether the streamed "For you" lane could have content (gates the Suspense). */
  showForYou: boolean
  /** Toolbar inputs. */
  facets: CatalogFacet[]
  sortOptions: SortOption[]
}

/** Assemble everything the /events Catalog renders, from the URL facets. */
export async function getEventsIndexData(params: EventsIndexParams): Promise<EventsIndexData> {
  const { q, category, format, date, price, energy, spots, near, sort } = params
  const query = (q ?? '').trim()
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let myCircleIds: string[] = []
  let myCircles: { id: string; name: string }[] = []
  let isCrew = false
  let isHost = false

  let myGeocell: { lat: number; lng: number } | null = null

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, community_role, membership_tier, home_geocell_lat, home_geocell_lng')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      if (profile.home_geocell_lat != null && profile.home_geocell_lng != null) {
        myGeocell = { lat: Number(profile.home_geocell_lat), lng: Number(profile.home_geocell_lng) }
      }
      // Event composing = paid (Crew/Supporter TIER) or a steward — PB.1/ADR-207.
      isCrew =
        ['crew', 'supporter'].includes((profile as { membership_tier?: string | null }).membership_tier ?? '') ||
        ['host', 'guide', 'mentor', 'admin', 'janitor'].includes(profile.community_role ?? '')
      isHost = ['host', 'guide', 'mentor', 'admin', 'janitor'].includes(profile.community_role ?? '')

      const { data: memberships } = await admin
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active')

      myCircleIds = (memberships ?? []).map((m) => m.circle_id as string)

      if (myCircleIds.length > 0) {
        const { data: circles } = await admin
          .from('circles')
          .select('id, name')
          .in('id', myCircleIds)
        myCircles = (circles ?? []) as { id: string; name: string }[]
      }
    }
  }

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title: pageTitle, description: pageDescription, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/events', CONTENT_FALLBACK)

  const nowDate = new Date()
  const now = nowDate.toISOString()
  const future = new Date(nowDate.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  // The columns we read for the card + facets. category / attendance_mode /
  // capacity / price_cents / cover_image_path are newer than the generated DB
  // types — read them through an untyped client (repo convention for
  // not-yet-regenerated columns; see lib/events/geocode.ts).
  const EVENT_SELECT = `id, title, slug, location, starts_at, ends_at, is_cancelled, is_demo,
       featured_at, scope_id, scope_type, category, energy_tag, capacity, attendance_mode, price_cents,
       cover_image_path, host:profiles!host_id ( id, display_name, handle )`

  // ── (1) In-scope CIRCLE events (the original circle-anchored listing) ────────
  let circleEvents: EventRow[] = []
  if (myCircleIds.length > 0) {
    let circleQuery = admin
      .from('events')
      .select(EVENT_SELECT)
      .in('scope_id', myCircleIds)
      // Browse shows only listable events: unlisted is link-only, private is
      // host-only (RLS enforces access; THIS enforces non-listing — ADR-202).
      .in('visibility', ['public', 'circle_only'])
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .lte('starts_at', future)
      .order('starts_at', { ascending: true })
    if (hideDemo) circleQuery = circleQuery.eq('is_demo', false)
    const { data: rawCircle } = await circleQuery.limit(40)
    circleEvents = (rawCircle ?? []) as unknown as EventRow[]
  }

  // ── (2) Standalone PUBLIC events near the viewer (hybrid scope, ADR-254) ─────
  // The Catalog is the union of the viewer's circle events AND standalone public
  // events near them. Discovery is governed by the RLS-respecting nearby_events
  // RPC (it returns only events the viewer may already read); we then enrich the
  // returned IDs with the display columns and keep only the STANDALONE public
  // ones (scope_type != 'circle') so circle events aren't double-counted. The
  // provenance distinction drives the `Public` chip on the card.
  let publicEvents: EventRow[] = []
  const circleIdSet = new Set(circleEvents.map((e) => e.id))
  if (myGeocell) {
    // A generous radius for the union; the Distance facet narrows it further.
    const nearby = await nearbyEvents(supabase, {
      lat: myGeocell.lat,
      lng: myGeocell.lng,
      radiusM: 50_000,
      limit: 60,
    })
    const distanceById = new Map(nearby.map((n) => [n.id, n.distanceM]))
    const candidateIds = nearby.map((n) => n.id).filter((id) => !circleIdSet.has(id))
    if (candidateIds.length > 0) {
      let publicQuery = admin
        .from('events')
        .select(EVENT_SELECT)
        .in('id', candidateIds)
        .eq('visibility', 'public')
        .neq('scope_type', 'circle')
        .eq('is_cancelled', false)
        .gte('starts_at', now)
        .lte('starts_at', future)
      if (hideDemo) publicQuery = publicQuery.eq('is_demo', false)
      const { data: rawPublic } = await publicQuery.limit(40)
      publicEvents = ((rawPublic ?? []) as unknown as EventRow[]).map((e) => ({
        ...e,
        distance_m: distanceById.get(e.id) ?? null,
        is_public_standalone: true,
      }))
    }
  }

  // Fallback so public events are discoverable WITHOUT a saved location: when the nearby
  // (geocell) path found nothing — the common case for a viewer who hasn't set a location —
  // list upcoming standalone public events directly. Without this, a public event only ever
  // surfaces via location-based discovery, so it never shows for a location-less viewer.
  if (publicEvents.length === 0) {
    let fallbackQuery = admin
      .from('events')
      .select(EVENT_SELECT)
      .eq('visibility', 'public')
      .neq('scope_type', 'circle')
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .lte('starts_at', future)
      .order('starts_at', { ascending: true })
    if (hideDemo) fallbackQuery = fallbackQuery.eq('is_demo', false)
    const { data: rawFallback } = await fallbackQuery.limit(40)
    publicEvents = ((rawFallback ?? []) as unknown as EventRow[])
      .filter((e) => !circleIdSet.has(e.id))
      .map((e) => ({ ...e, distance_m: null, is_public_standalone: true }))
  }

  const events: EventRow[] = [...circleEvents, ...publicEvents]
  const hasAnyScope = myCircleIds.length > 0 || !!myGeocell

  // Circle names + coordinates for scope_ids (only the circle-scoped events).
  const circleScopeIds = [...new Set(events.filter((e) => e.scope_type === 'circle').map((e) => e.scope_id))]
  const circleNames: Record<string, string> = {}
  const circleCoords: Record<string, { lat: number; lng: number }> = {}
  if (circleScopeIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('id, name, latitude, longitude')
      .in('id', circleScopeIds)
    ;(circles ?? []).forEach((c: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
      circleNames[c.id] = c.name
      if (c.latitude != null && c.longitude != null) {
        circleCoords[c.id] = { lat: Number(c.latitude), lng: Number(c.longitude) }
      }
    })
  }

  // Resolve cover images. cover_image_path lives in the PUBLIC `event-media`
  // bucket (mirrors event-activity / recap-album), so a plain public URL serves —
  // no signing, and next/image can optimize it (next.config remotePatterns).
  const coverUrls: Record<string, string> = {}
  for (const e of events) {
    if (e.cover_image_path) {
      const { data } = admin.storage.from('event-media').getPublicUrl(e.cover_image_path)
      if (data?.publicUrl) coverUrls[e.id] = data.publicUrl
    }
  }

  // RSVP data.
  const eventIds = events.map((e) => e.id)
  const rsvpCounts: Record<string, number> = {}
  const myRsvps = new Set<string>()

  if (eventIds.length > 0) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'going')
    ;(rsvps ?? []).forEach((r: { event_id: string }) => {
      rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] ?? 0) + 1
    })

    if (myProfileId) {
      const { data: mine } = await admin
        .from('event_rsvps')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('profile_id', myProfileId)
        .eq('status', 'going')
      ;(mine ?? []).forEach((r: { event_id: string }) => myRsvps.add(r.event_id))
    }
  }

  // ── Facets (applied server-side; URL-driven so the view stays shareable) ────
  const goingCount = (e: EventRow) => rsvpCounts[e.id] ?? 0
  const hasSpots = (e: EventRow) => e.capacity == null || goingCount(e) < e.capacity

  // Distance: prefer the event's OWN measured distance (standalone public events,
  // from the RPC); fall back to viewer → hosting-circle for circle events. Active
  // only when a home location is set.
  const nearKm = near ? Number(near) : null
  const eventDistanceKm = (e: EventRow): number | null => {
    if (typeof e.distance_m === 'number') return e.distance_m / 1000
    if (myGeocell) {
      const c = circleCoords[e.scope_id]
      if (c) return distanceKm(myGeocell.lat, myGeocell.lng, c.lat, c.lng)
    }
    return null
  }
  const withinBand = (e: EventRow) => {
    if (!myGeocell || !nearKm) return true
    const km = eventDistanceKm(e)
    if (km == null) return false // no honest distance → can't claim it's near
    return km <= nearKm
  }

  // Date-range facet → starts_at window.
  const dateWindow = dateRangeWindow(date, nowDate)

  // Free-text search over the fields we have client-side (title / location /
  // host). The richer FTS/embedding path (EVENTS-REWORK B2) lives server-side;
  // here we keep the listing honest with a simple contains match.
  const needle = query.toLowerCase()
  const matchesQuery = (e: EventRow) => {
    if (!needle) return true
    return (
      e.title.toLowerCase().includes(needle) ||
      (e.location ?? '').toLowerCase().includes(needle) ||
      (e.host?.display_name ?? '').toLowerCase().includes(needle)
    )
  }

  const isFree = (e: EventRow) => e.price_cents == null || e.price_cents === 0

  const filteredEvents = events.filter((e) => {
    if (category && e.category !== category) return false
    if (format && (e.attendance_mode ?? 'in_person') !== format) return false
    if (energy && e.energy_tag !== energy) return false
    if (price === 'free' && !isFree(e)) return false
    if (price === 'paid' && isFree(e)) return false
    if (spots === '1' && !hasSpots(e)) return false
    if (nearKm && !withinBand(e)) return false
    if (dateWindow) {
      const t = new Date(e.starts_at).getTime()
      if (t < dateWindow.from.getTime() || t > dateWindow.to.getTime()) return false
    }
    if (!matchesQuery(e)) return false
    return true
  })
  const filtering = !!(query || category || format || date || price || energy || spots || nearKm)

  // ── Sort ────────────────────────────────────────────────────────────────────
  // Default soonest-first. Distance + Relevance are only offered when meaningful
  // (a home location / an active search), so an absent/invalid value falls back
  // to date. Sorted in place on the filtered list (a copy — never mutate state).
  const effectiveSort =
    sort === 'distance' && myGeocell
      ? 'distance'
      : sort === 'popularity'
        ? 'popularity'
        : sort === 'relevance' && query
          ? 'relevance'
          : 'date'

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    if (effectiveSort === 'distance') {
      const da = eventDistanceKm(a)
      const db = eventDistanceKm(b)
      if (da == null && db == null) return a.starts_at.localeCompare(b.starts_at)
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    }
    if (effectiveSort === 'popularity') {
      const diff = goingCount(b) - goingCount(a)
      return diff !== 0 ? diff : a.starts_at.localeCompare(b.starts_at)
    }
    if (effectiveSort === 'relevance') {
      // Title hits rank above location/host hits; ties fall back to soonest.
      const score = (e: EventRow) => (e.title.toLowerCase().includes(needle) ? 0 : 1)
      const diff = score(a) - score(b)
      return diff !== 0 ? diff : a.starts_at.localeCompare(b.starts_at)
    }
    return a.starts_at.localeCompare(b.starts_at)
  })

  const goingEvents = sortedEvents.filter((e) => myRsvps.has(e.id))

  // ── Map pins (Events B-4) ───────────────────────────────────────────────────
  // Plot each in-person event. Standalone public events sit at their OWN geocoded
  // point's HOSTING CIRCLE-equivalent? No — they have no circle, so they ride the
  // circle-anchored pin only for circle events; standalone events are pinned at
  // their own coordinates is out of scope here (we have only distance, not lat/lng
  // from the RPC), so they aren't mapped — the list carries them. Circle events
  // plot at their HOSTING CIRCLE'S public coordinates (ADR-186). The toggle hides
  // itself when there's nothing to map.
  const mapPins: EventMapPin[] = sortedEvents
    .filter((e) => e.scope_type === 'circle' && e.attendance_mode !== 'online' && e.category !== 'online' && !!circleCoords[e.scope_id])
    .map((e) => {
      const c = circleCoords[e.scope_id]
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        whenLabel: formatWhen(e.starts_at, nowDate),
        cityLabel: circleNames[e.scope_id] ?? null,
        lat: c.lat,
        lng: c.lng,
      }
    })

  // The "For You" lane is the page's one slow path (embedding scoring + optional
  // AI blurbs) — it streams in behind <Suspense> below so the shell, stats, and
  // event lists render immediately (PAGE-FRAMEWORK §5). Render it only when it
  // could have content: signed-in, no facet active, more than one event.
  const showForYou = !!myProfileId && !filtering && sortedEvents.length > 1

  // Facets + sort for the toolbar. Distance + the Distance sort only appear with a
  // home location; Relevance sort only with an active search.
  const facets: CatalogFacet[] = [
    { label: 'Category', paramKey: 'category', options: CATEGORY_OPTIONS },
    { label: 'Format', paramKey: 'format', options: FORMAT_OPTIONS },
    { label: 'Date', paramKey: 'date', options: DATE_OPTIONS },
    { label: 'Price', paramKey: 'price', options: PRICE_OPTIONS },
    { label: 'Energy', paramKey: 'energy', options: ENERGY_OPTIONS },
    { label: 'Spots', paramKey: 'spots', options: SPOTS_OPTIONS },
    { label: 'Distance', paramKey: 'near', options: NEAR_OPTIONS, show: !!myGeocell },
  ]
  const sortOptions: SortOption[] = [
    SORT_DATE,
    ...(myGeocell ? [SORT_DISTANCE] : []),
    SORT_POPULARITY,
    ...(query ? [SORT_RELEVANCE] : []),
  ]

  return {
    content: {
      title: pageTitle,
      description: pageDescription,
      heroImage: heroImage ?? null,
      ctaLabel: ctaLabel ?? null,
      ctaHref: ctaHref ?? null,
    },
    nowDate,
    myProfileId,
    myCircles,
    isCrew,
    isHost,
    goingEvents,
    sortedEvents,
    mapPins,
    circleNames,
    coverUrls,
    rsvpCounts,
    myRsvps,
    filtering,
    hasAnyScope,
    showForYou,
    facets,
    sortOptions,
  }
}
