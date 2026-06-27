'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { safeHttpUrl } from '@/lib/safe-url'
import {
  CalendarDays,
  MapPin,
  Video,
  Users,
  ChevronDown,
  Clock,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { EventMapPin } from './events-map'
import type { WarmProofAttendee } from './warm-proof'

// EventFactPanel (EVENTS-DESIGN §2.5, C4) — the critical-info card in the Join
// aside (and stacked above the Post area on mobile). A single calm card grouping
// the facts a guest needs to decide: when, where (+ a city-level mini map),
// how-full, and who's going.
//
// It is a client leaf so it can lazy-mount the maplibre mini map (ssr:false), the
// same constraint events-map-client.tsx works under. Everything else is passed in
// by the page (no fetching here). Capacity reads honour Law 1: "Filling up. N left"
// only when the page says it's genuinely near-full; never a bare low count. The
// guest list is privacy-by-default: Crew see names, others see a count.

// maplibre must never run on the server.
const EventsMap = dynamic(() => import('./events-map'), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

// Exact-venue map (the event's own geog point), shown in place of the city-level
// circle pin when the event has a precise location. Also client-only.
const EventVenueMap = dynamic(() => import('./event-venue-map'), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

const MAX_FACES = 6

export type FactGuest = WarmProofAttendee & { handle: string }

export function EventFactPanel({
  whenLine,
  isOnline,
  location,
  onlineUrl,
  mapPin,
  venuePoint = null,
  going,
  nearFull = false,
  spotsLeft = null,
  guests = [],
  guestsAreVisible,
}: {
  /** Preformatted "when" line, e.g. "Thursday, June 19 at 7:00 PM". */
  whenLine: string
  /** Online / hybrid event → show a join-link affordance instead of a map. */
  isOnline?: boolean
  /** The venue line. Null for a purely online event. */
  location?: string | null
  /** The join link for online events (shown once the viewer is in, per the page). */
  onlineUrl?: string | null
  /** The hosting circle's PUBLIC, city-level pin for the mini map (never the exact
   *  venue). Null = no map. */
  mapPin?: EventMapPin | null
  /** The event's OWN precise geog point. When set (published + in-person + geocoded),
   *  it replaces the city-level circle pin with an exact-venue map. Null = no precise map. */
  venuePoint?: { lat: number; lng: number } | null
  /** Confirmed 'going' count. */
  going: number
  /** Page-decided: capacity is real AND genuinely near full. */
  nearFull?: boolean
  /** Remaining seats (only meaningful when nearFull). */
  spotsLeft?: number | null
  /** Going attendees for the roster / pile. */
  guests?: FactGuest[]
  /** Crew see the roster; others see only the count (privacy-by-default). */
  guestsAreVisible: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const faces = guests.slice(0, MAX_FACES)
  const overflow = Math.max(0, going - faces.length)

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      {/* When */}
      <p className="flex items-start gap-2 text-sm text-text">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
        <span>{whenLine}</span>
      </p>

      {/* Where — location line, then a city-level mini map for in-person events */}
      {isOnline ? (
        <p className="flex items-start gap-2 text-sm text-text">
          <Video className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          {safeHttpUrl(onlineUrl) ? (
            <a
              href={onlineUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary-strong hover:underline"
            >
              Join link
            </a>
          ) : (
            <span className="text-muted">Online. Link shows once you RSVP.</span>
          )}
        </p>
      ) : location ? (
        <p className="flex items-start gap-2 text-sm text-text">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          <span>{location}</span>
        </p>
      ) : null}

      {/* A precise venue point wins: show the exact spot. Otherwise fall back to the
          city-level circle pin (privacy default for events without their own geog). */}
      {!isOnline && venuePoint ? (
        <div>
          <EventVenueMap lat={venuePoint.lat} lng={venuePoint.lng} />
          <p className="mt-1.5 text-3xs text-subtle">The pin marks the exact venue.</p>
        </div>
      ) : !isOnline && mapPin ? (
        <div>
          <EventsMap
            pins={[mapPin]}
            className="h-40 w-full overflow-hidden rounded-xl border border-border"
          />
          <p className="mt-1.5 text-3xs text-subtle">
            The pin sits on the circle&rsquo;s area, not the exact address.
          </p>
        </div>
      ) : null}

      {/* Capacity — only ever the warm "filling up" line, never a bare low count */}
      {nearFull && typeof spotsLeft === 'number' && spotsLeft > 0 && (
        <p className="flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-primary-strong">
          <Clock className="h-3.5 w-3.5" />
          Filling up. {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
        </p>
      )}

      {/* Guest list — names for Crew, a count for everyone else */}
      <div className="border-t border-border pt-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
          <Users className="h-3.5 w-3.5 text-subtle" />
          {going > 0 ? `${going} going` : 'No one going yet'}
        </p>

        {going > 0 && faces.length > 0 && (
          <div className="mb-2 flex -space-x-2" aria-hidden>
            {faces.map((g) =>
              g.avatarUrl ? (
                <Image
                  key={g.id}
                  src={g.avatarUrl}
                  alt={g.displayName}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-surface"
                />
              ) : (
                <div
                  key={g.id}
                  className="flex h-7 w-7 select-none items-center justify-center rounded-full bg-primary-bg text-2xs font-semibold text-primary-strong ring-2 ring-surface"
                >
                  {getInitials(g.displayName)}
                </div>
              ),
            )}
            {overflow > 0 && (
              <div className="flex h-7 w-7 select-none items-center justify-center rounded-full bg-surface-elevated text-2xs font-semibold text-muted ring-2 ring-surface">
                +{overflow}
              </div>
            )}
          </div>
        )}

        {going > 0 && guestsAreVisible && guests.length > 0 && (
          <>
            <ul className="space-y-0.5">
              {(showAll ? guests : guests.slice(0, 5)).map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/people/${g.handle}`}
                    className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-surface-elevated"
                  >
                    {g.avatarUrl ? (
                      <Image
                        src={g.avatarUrl}
                        alt={g.displayName}
                        width={24}
                        height={24}
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full bg-primary-bg text-3xs font-semibold text-primary-strong">
                        {getInitials(g.displayName)}
                      </div>
                    )}
                    <span className="truncate text-xs text-text">{g.displayName}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {guests.length > 5 && !showAll && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Show all {guests.length}
              </button>
            )}
          </>
        )}

        {going > 0 && !guestsAreVisible && (
          <p className="text-xs text-muted">
            {going} {going === 1 ? 'person is' : 'people are'} going.
          </p>
        )}
      </div>
    </div>
  )
}
