import Link from 'next/link'
import { Suspense } from 'react'
import { CalendarDays } from 'lucide-react'
import { EventCompose } from './event-compose'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { EventsFilterBar } from './events-filter-bar'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageContents } from '@/components/templates/page-contents'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EventCard } from '@/components/events/event-card'
import { EventsMapToggle } from '@/components/events/events-map-client'
import { CalendarSubscribe } from '@/components/events/calendar-subscribe'
import { EventConnectors } from '@/components/events/event-connectors'
import { pageContentMetadata } from '@/lib/page-content'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { aiAvailable } from '@/lib/ai/usage'
import { getEventsIndexData, CONTENT_FALLBACK, type EventRow } from './index-data'

// The browse grid degrades on CONTAINER width, not viewport — so it thins to two
// columns (then one) inside the rail-narrowed main column and only opens to four
// on a genuinely wide column. Every event lane composes this one class.
const EVENT_GRID = 'grid grid-cols-1 gap-4 @lg:grid-cols-2 @4xl:grid-cols-4'
// The highlight lanes ("You're going" / "For you") stay a calmer two-up.
const EVENT_GRID_TWO = 'grid grid-cols-1 gap-4 @lg:grid-cols-2'

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/events', CONTENT_FALLBACK)
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    format?: string
    date?: string
    price?: string
    energy?: string
    spots?: string
    near?: string
    sort?: string
  }>
}) {
  const {
    content,
    nowDate,
    myProfileId,
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
  } = await getEventsIndexData(await searchParams)

  const { title: pageTitle, description: pageDescription, heroImage, ctaLabel, ctaHref } = content

  // Operator-set CTA (PX.1) — shows only when both label + link are set.
  const operatorCta =
    ctaLabel && ctaHref ? (
      <a
        href={ctaHref}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
      >
        {ctaLabel}
      </a>
    ) : null

  const toolbar = <EventsFilterBar facets={facets} sortOptions={sortOptions} />

  return (
    <IndexTemplate
      // Standardized header (PAGE-FRAMEWORK): breadcrumb -> cropped hero -> title, from the
      // template's first-class props.
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/events', label: 'Events' },
      ]}
      // Coded fallback so the banner (and the controls row under it) always renders even when no
      // operator hero is set — the same pattern Journeys / Practices / Library use.
      heroImage={heroImage ?? '/images/site/community-dinner.jpg'}
      // Overlay hero (the uniform Journeys / Practices / Library / Circles grammar): title and
      // description sit ON the image. Events was the last index still on the banner-above-title
      // lockup, so it read differently from its siblings.
      heroOverlay
      title={pageTitle}
      description={pageDescription}
      // Secondary controls live UNDER the hero banner (a wrapping pill row); the header-right
      // action keeps only the primary "New Event" + the operator CTA.
      underHero={
        (isHost || myProfileId) ? (
          <>
            {isHost && (
              <Link
                href="/admin/events"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                Manage
              </Link>
            )}
            {/* Captured-poster drafts (the Poster Events flow) — every member can capture a town
                poster, so the link rides with sign-in. */}
            {myProfileId && (
              <Link
                href="/events/drafts"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                My drafts
              </Link>
            )}
            {/* Subscribe-to-calendar affordance (Events B-4) — signed-in members only. */}
            {myProfileId && <CalendarSubscribe />}
          </>
        ) : undefined
      }
      action={
        (myProfileId || operatorCta) ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {/* Create an event. Crew (and stewards) get the real composer; everyone else
                signed in gets the "Crew is free during beta" upgrade popup. */}
            {myProfileId && (
              <CrewGateButton
                isCrew={isCrew}
                label="New Event"
                reason="create-event"
                buttonClassName="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <EventCompose />
              </CrewGateButton>
            )}
            {operatorCta}
          </div>
        ) : undefined
      }
      toolbar={toolbar}
    >
      {/* No stat strip: event/circle counts aren't gamified, so they stay quiet
          inline context on the section headers below, never KPI tiles (the
          gamified-stat law, MEMBER-DESIGN-SYSTEM §2). */}

      {/* Table of contents — only meaningful once there's more than one section.
          (The streamed "For you" lane is progressive content and stays out of the
          TOC so the shell never waits on it.) */}
      <PageContents
        sections={[
          ...(goingEvents.length > 0
            ? [{ id: 'events-going', label: "You're going", count: goingEvents.length }]
            : []),
          { id: 'events-upcoming', label: goingEvents.length > 0 ? 'Coming up' : 'Upcoming', count: sortedEvents.length },
        ]}
      />

      <div className="space-y-8">
        {showForYou && (
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />}>
            <ForYouLane
              profileId={myProfileId!}
              events={sortedEvents}
              circleNames={circleNames}
              coverUrls={coverUrls}
              rsvpCounts={rsvpCounts}
              myRsvps={myRsvps}
              now={nowDate}
            />
          </Suspense>
        )}

        {/* Connector suggestions (Events B-4) — fellow attendees who share a
            Channel with you and aren't connected yet. Its own slow read, so it
            streams behind Suspense and renders nothing unless there's a real
            suggestion (EventConnectors returns null otherwise). */}
        {myProfileId && sortedEvents.length > 0 && (
          <Suspense fallback={null}>
            <EventConnectors viewerProfileId={myProfileId} eventIds={sortedEvents.map((e) => e.id)} />
          </Suspense>
        )}

        {goingEvents.length > 0 && (
          <section id="events-going" className="scroll-mt-20">
            <SectionHeader title="You're going" count={goingEvents.length} />
            <div className="@container">
              <div className={EVENT_GRID_TWO}>
              {goingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  circleName={circleNames[event.scope_id]}
                  coverUrl={coverUrls[event.id]}
                  going={rsvpCounts[event.id] ?? 0}
                  isGoing
                  now={nowDate}
                  canRsvp={!!myProfileId}
                />
              ))}
              </div>
            </div>
          </section>
        )}

        <section id="events-upcoming" className="scroll-mt-20">
          <SectionHeader title={goingEvents.length > 0 ? 'Coming up' : 'Upcoming events'} count={sortedEvents.length} />
          {sortedEvents.length === 0 ? (
            filtering ? (
              <EmptyState
                icon={CalendarDays}
                title="No events match these filters"
                description="Try a wider date or clear a filter to see everything coming up."
                action={
                  <Link href="/events" className="text-sm font-semibold text-primary-strong hover:underline">
                    Clear filters
                  </Link>
                }
              />
            ) : hasAnyScope ? (
              // Hybrid scope (ADR-254): a member with a circle or a home location
              // who simply has nothing upcoming yet.
              <EmptyState
                icon={CalendarDays}
                title="Nothing on the calendar yet"
                description="No events near you in the next 60 days. When your circles or hosts nearby plan something, it lands here."
                action={
                  isCrew ? (
                    <Link href="/events/new" className="text-sm font-semibold text-primary-strong hover:underline">
                      Create the first one
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              // Cold start: no circles AND no home location set. Under hybrid scope
              // the Catalog leads with "set your location to see what's near you,"
              // and joining a circle is the secondary nudge (EVENTS-DESIGN §3.3).
              <EmptyState
                icon={CalendarDays}
                title="Nothing near you yet"
                description="Set your home location to see public events nearby, or join a circle and its gatherings show up here."
                action={
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/settings/profile"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
                    >
                      Set your location
                    </Link>
                    <Link href="/circles" className="text-sm font-semibold text-primary-strong hover:underline">
                      Find a circle
                    </Link>
                  </div>
                }
              />
            )
          ) : (
            // Map/list toggle (Events B-4): the list is the default; the map is a
            // lazily-mounted client island plotting in-person events at city level.
            <EventsMapToggle pins={mapPins}>
              <div className="@container">
                <div className={EVENT_GRID}>
                {sortedEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    circleName={circleNames[event.scope_id]}
                    coverUrl={coverUrls[event.id]}
                    going={rsvpCounts[event.id] ?? 0}
                    isGoing={myRsvps.has(event.id)}
                    now={nowDate}
                    canRsvp={!!myProfileId}
                  />
                ))}
                </div>
              </div>
            </EventsMapToggle>
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
  profileId, events, circleNames, coverUrls, rsvpCounts, myRsvps, now,
}: {
  profileId: string
  events: EventRow[]
  circleNames: Record<string, string>
  coverUrls: Record<string, string>
  rsvpCounts: Record<string, number>
  myRsvps: Set<string>
  now: Date
}) {
  // Recommend events the viewer ISN'T already on — surfacing one they've already
  // RSVP'd to is noise (it sits in "You're going" right above). Score only the rest.
  const candidates = events.filter((e) => !myRsvps.has(e.id))
  const byId = new Map(candidates.map((e) => [e.id, e]))
  const scored = await scoreEventsForViewer(profileId, candidates.map((e) => e.id))
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
      <div className="@container">
        <div className={EVENT_GRID}>
        {forYouEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            circleName={circleNames[event.scope_id]}
            coverUrl={coverUrls[event.id]}
            going={rsvpCounts[event.id] ?? 0}
            isGoing={myRsvps.has(event.id)}
            now={now}
            canRsvp
            blurb={forYouBlurbs[event.id]}
          />
        ))}
        </div>
      </div>
    </section>
  )
}
