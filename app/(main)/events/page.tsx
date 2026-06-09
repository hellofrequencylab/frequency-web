import Link from 'next/link'
import { Suspense } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { EventCompose } from './event-compose'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageContents } from '@/components/templates/page-contents'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { DemoBadge } from '@/components/ui/demo-badge'
import { FacetDropdown } from '@/components/ui/facet-dropdown'
import { RsvpButton } from '@/components/events/rsvp-button'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { resolvePageContent } from '@/lib/page-content'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { aiAvailable } from '@/lib/ai/usage'

type EventRow = {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
  ends_at: string | null
  is_cancelled: boolean
  is_demo: boolean
  scope_id: string
  scope_type: string
  // P0 taxonomy + capacity (newer than the generated DB types — read via the
  // untyped-client cast, the repo convention for not-yet-regenerated columns).
  category: string | null
  energy_tag: string | null
  capacity: number | null
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

// Distance bands from the viewer's privacy-fuzzed home geocell (~1.1km grid,
// ADR-186 — never an exact coordinate) to the HOSTING CIRCLE's location. Only
// shown when the viewer has a home location set; events whose circle has no
// coordinates are excluded while the facet is active.
const NEAR_OPTIONS: { value: string; label: string }[] = [
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
  { value: '50', label: 'Within 50 km' },
]

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

// Relative "when" — "Tomorrow at 3pm" / "Friday at 3pm" / "Jun 24 at 3pm".
// `now` is passed in so this stays a pure helper (no clock read at render).
function formatWhen(iso: string, now: Date) {
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

function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
      <span className="text-xs font-semibold uppercase leading-none tracking-wide">{month}</span>
      <span className="text-xl font-bold leading-tight">{day}</span>
    </div>
  )
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; energy?: string; spots?: string; near?: string }>
}) {
  const { category, energy, spots, near } = await searchParams
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
      .select('id, community_role, home_geocell_lat, home_geocell_lng')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      myProfileId = profile.id
      if (profile.home_geocell_lat != null && profile.home_geocell_lng != null) {
        myGeocell = { lat: Number(profile.home_geocell_lat), lng: Number(profile.home_geocell_lng) }
      }
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')
      isHost = ['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')

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

  // Operator-editable page header (ADR-180) — falls back to these defaults.
  const { title: pageTitle, description: pageDescription } = await resolvePageContent('/events', {
    title: 'Events',
    description:
      'Group rides, gatherings, and meetups your circles are running near you. RSVP to see who’s coming, show up, and earn zaps for every one you make.',
  })

  if (myCircleIds.length === 0) {
    return (
      <IndexTemplate title={pageTitle} description={pageDescription}>
        <EmptyState
          icon={CalendarDays}
          title="No events on your radar yet"
          description="Events live inside circles. Join one near you and its gatherings show up right here."
          action={
            <Link
              href="/circles"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
            >
              Find a circle
            </Link>
          }
        />
      </IndexTemplate>
    )
  }

  const nowDate = new Date()
  const now = nowDate.toISOString()
  const future = new Date(nowDate.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString()

  // category / energy_tag / capacity are newer than the generated DB types — read
  // them through an untyped client (repo convention for not-yet-regenerated
  // columns; see lib/billing/* and lib/events/capacity.ts).
  let eventsQuery = (admin as unknown as SupabaseClient)
    .from('events')
    .select(
      `id, title, slug, location, starts_at, ends_at, is_cancelled, is_demo,
       scope_id, scope_type, category, energy_tag, capacity,
       host:profiles!host_id ( id, display_name, handle )`
    )
    .in('scope_id', myCircleIds)
    // Browse shows only listable events: unlisted is link-only, private is
    // host-only (RLS enforces access; THIS enforces non-listing — ADR-202).
    .in('visibility', ['public', 'circle_only'])
    .eq('is_cancelled', false)
    .gte('starts_at', now)
    .lte('starts_at', future)
    .order('starts_at', { ascending: true })
  // Demo content: hidden when global demo_mode is off OR the member turned beta content off.
  if (!(await demoModeEnabled()) || (await viewerHidesDemo())) eventsQuery = eventsQuery.eq('is_demo', false)
  const { data: rawEvents } = await eventsQuery
    .limit(30)

  const events = (rawEvents ?? []) as unknown as EventRow[]

  // Circle names for scope_ids.
  const circleIds = [...new Set(events.map((e) => e.scope_id))]
  const circleNames: Record<string, string> = {}
  const circleCoords: Record<string, { lat: number; lng: number }> = {}
  if (circleIds.length > 0) {
    const { data: circles } = await admin
      .from('circles')
      .select('id, name, latitude, longitude')
      .in('id', circleIds)
    ;(circles ?? []).forEach((c: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
      circleNames[c.id] = c.name
      if (c.latitude != null && c.longitude != null) {
        circleCoords[c.id] = { lat: Number(c.latitude), lng: Number(c.longitude) }
      }
    })
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
  // category + energy match a column directly; "spots" is the only real scarcity
  // signal — capacity null (unlimited) OR going-count < capacity. We never filter
  // *out* low counts as scarcity, and never surface a low/zero count as pressure.
  const goingCount = (e: EventRow) => rsvpCounts[e.id] ?? 0
  const hasSpots = (e: EventRow) => e.capacity == null || goingCount(e) < e.capacity

  // "Near me": viewer's fuzzed home geocell → hosting circle's coordinates,
  // banded (NEAR_OPTIONS). Active only when both ends have a location.
  const nearKm = near ? Number(near) : null
  const withinBand = (e: EventRow) => {
    if (!myGeocell || !nearKm) return true
    const c = circleCoords[e.scope_id]
    if (!c) return false // no circle location → can't honestly claim it's near
    return distanceKm(myGeocell.lat, myGeocell.lng, c.lat, c.lng) <= nearKm
  }

  const filteredEvents = events.filter((e) => {
    if (category && e.category !== category) return false
    if (energy && e.energy_tag !== energy) return false
    if (spots === '1' && !hasSpots(e)) return false
    if (nearKm && !withinBand(e)) return false
    return true
  })
  const filtering = !!(category || energy || spots || nearKm)

  const goingEvents = filteredEvents.filter((e) => myRsvps.has(e.id))

  // The "For You" lane is the page's one slow path (embedding scoring + optional
  // AI blurbs) — it streams in behind <Suspense> below so the shell, stats, and
  // event lists render immediately (PAGE-FRAMEWORK §5). Render it only when it
  // could have content: signed-in, no facet active, more than one event.
  const showForYou = !!myProfileId && !filtering && filteredEvents.length > 1

  const facetRow = (
    <div className="flex flex-wrap items-center gap-2">
      <FacetDropdown label="Category" paramKey="category" options={CATEGORY_OPTIONS} />
      <FacetDropdown label="Energy" paramKey="energy" options={ENERGY_OPTIONS} />
      <FacetDropdown label="Spots" paramKey="spots" options={SPOTS_OPTIONS} />
      {/* Distance needs a home location on the profile — hidden without one. */}
      {myGeocell && <FacetDropdown label="Distance" paramKey="near" options={NEAR_OPTIONS} />}
    </div>
  )

  return (
    <IndexTemplate
      title={pageTitle}
      description={pageDescription}
      action={
        (isCrew || isHost) ? (
          <div className="flex items-center gap-3">
            {isHost && (
              <Link href="/admin/events" className="text-sm font-medium text-muted transition-colors hover:text-primary-strong">
                Manage
              </Link>
            )}
            {isCrew && <EventCompose groups={myCircles} />}
          </div>
        ) : undefined
      }
      toolbar={facetRow}
    >
      <div className="mb-6">
        <StatStrip
          items={[
            { value: events.length, label: 'Upcoming' },
            { value: goingEvents.length, label: 'You’re going' },
            { value: myCircles.length, label: 'Your circles' },
          ]}
        />
      </div>

      {/* Table of contents — only meaningful once there's more than one section.
          (The streamed "For you" lane is progressive content and stays out of the
          TOC so the shell never waits on it.) */}
      <PageContents
        sections={[
          ...(goingEvents.length > 0
            ? [{ id: 'events-going', label: "You're going", count: goingEvents.length }]
            : []),
          { id: 'events-upcoming', label: goingEvents.length > 0 ? 'Coming up' : 'Upcoming', count: filteredEvents.length },
        ]}
      />

      <div className="space-y-8">
        {showForYou && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />}>
            <ForYouLane
              profileId={myProfileId!}
              events={filteredEvents}
              circleNames={circleNames}
              rsvpCounts={rsvpCounts}
              myRsvps={myRsvps}
              now={nowDate}
            />
          </Suspense>
        )}

        {goingEvents.length > 0 && (
          <section id="events-going" className="scroll-mt-20">
            <SectionHeader title="You're going" count={goingEvents.length} />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {goingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  circleName={circleNames[event.scope_id]}
                  going={rsvpCounts[event.id] ?? 0}
                  isGoing
                  now={nowDate}
                  canRsvp={!!myProfileId}
                />
              ))}
            </div>
          </section>
        )}

        <section id="events-upcoming" className="scroll-mt-20">
          <SectionHeader title={goingEvents.length > 0 ? 'Coming up' : 'Upcoming events'} count={filteredEvents.length} />
          {filteredEvents.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={filtering ? 'No events match these filters' : 'Nothing on the calendar yet'}
              description={
                filtering
                  ? 'Try a different category or energy, or clear the filters to see everything coming up.'
                  : 'No events in the next 60 days. When your circles plan something, it lands here.'
              }
              action={
                filtering ? (
                  <Link href="/events" className="text-sm font-semibold text-primary-strong hover:underline">
                    Clear filters
                  </Link>
                ) : isCrew ? (
                  <Link href="/events/new" className="text-sm font-semibold text-primary-strong hover:underline">
                    Create the first one
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  circleName={circleNames[event.scope_id]}
                  going={rsvpCounts[event.id] ?? 0}
                  isGoing={myRsvps.has(event.id)}
                  now={nowDate}
                  canRsvp={!!myProfileId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}

// ── "For You" lane (streamed behind Suspense — the page's one slow path) ──────
// Hybrid interest+social+context ranking over the in-scope events. COLD-START
// RULE (EVENTS-SYSTEM §3/§4): never render an empty or random algorithmic feed.
// We only show the lane when the viewer has a USABLE signal — at least one event
// is personalized by real interest (embedding) or social proof (people they know
// going). Otherwise it renders nothing and soonest-first carries the page.
async function ForYouLane({
  profileId, events, circleNames, rsvpCounts, myRsvps, now,
}: {
  profileId: string
  events: EventRow[]
  circleNames: Record<string, string>
  rsvpCounts: Record<string, number>
  myRsvps: Set<string>
  now: Date
}) {
  const byId = new Map(events.map((e) => [e.id, e]))
  const scored = await scoreEventsForViewer(profileId, events.map((e) => e.id))
  // Usable signal = real personalization, not just the always-present time/
  // proximity floor. No signal → render nothing (cold-start fallback).
  const hasUsableSignal = scored.some((s) => s.interest > 0 || s.social > 0)
  if (!hasUsableSignal) return null

  const forYouEvents = scored
    .map((s) => byId.get(s.eventId))
    .filter((e): e is EventRow => !!e)
    .slice(0, 4)
  if (forYouEvents.length === 0) return null

  // Optional warm blurbs — best-effort, parallel, degrade to nothing when AI
  // is off / over budget / has no genuine overlap to speak to.
  const forYouBlurbs: Record<string, string> = {}
  if (await aiAvailable()) {
    const blurbs = await Promise.all(
      forYouEvents.map((e) => eventBlurb(profileId, e.id).catch(() => null)),
    )
    forYouEvents.forEach((e, i) => {
      const b = blurbs[i]
      if (b) forYouBlurbs[e.id] = b
    })
  }

  return (
    <section id="events-for-you" className="scroll-mt-20">
      <SectionHeader title="For you" count={forYouEvents.length} />
      <p className="-mt-2 mb-3 text-xs text-muted">
        Picked from your circles, the people you know, and what’s near you.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {forYouEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            circleName={circleNames[event.scope_id]}
            going={rsvpCounts[event.id] ?? 0}
            isGoing={myRsvps.has(event.id)}
            now={now}
            canRsvp
            blurb={forYouBlurbs[event.id]}
          />
        ))}
      </div>
    </section>
  )
}

// Warm, never-FOMO scarcity badge. Capacity is the ONLY real scarcity signal
// (events.capacity; null = unlimited). We surface care/momentum, never pressure:
//   • "Waitlist" when genuinely full (going ≥ capacity)
//   • "Filling up" ONLY when near-full — spots left > 0 AND ≤ 20% of capacity
// No low/zero counts, no countdowns, no fake urgency (EVENTS-SYSTEM §4, Law 1).
function WarmBadge({ capacity, going }: { capacity: number | null; going: number }) {
  if (capacity == null) return null
  const spotsLeft = Math.max(0, capacity - going)
  if (spotsLeft === 0) {
    return (
      <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
        Waitlist
      </span>
    )
  }
  if (spotsLeft <= capacity * 0.2) {
    return (
      <span className="shrink-0 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
        Filling up
      </span>
    )
  }
  return null
}

function EventCard({
  event, circleName, going, isGoing, now, canRsvp, blurb,
}: {
  event: EventRow
  circleName?: string
  going: number
  isGoing: boolean
  now: Date
  canRsvp: boolean
  /** Optional AI "why you'd vibe" line — only set on the "For you" lane. */
  blurb?: string
}) {
  const warm = <WarmBadge capacity={event.capacity} going={going} />
  return (
    <EntityCard
      href={`/events/${event.slug}`}
      anchor={<DateBlock iso={event.starts_at} />}
      title={event.title}
      description={blurb}
      badge={
        (event.is_demo || warm) ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {event.is_demo && <DemoBadge />}
            {warm}
          </span>
        ) : undefined
      }
      context={formatWhen(event.starts_at, now)}
      meta={
        <>
          {circleName && (
            <span className="rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">
              {circleName}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />{event.location}
            </span>
          )}
          {going > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />{going} going
            </span>
          )}
          {event.host && <span>Hosted by {event.host.display_name}</span>}
        </>
      }
      action={canRsvp ? <RsvpButton eventId={event.id} isGoing={isGoing} /> : undefined}
    />
  )
}
