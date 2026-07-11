// The REQUEST-SCOPED active event context for the event DETAIL route — the seam that lets the
// event page's arrangeable body render as self-fetching layout modules (the page-settings module
// engine, ADR-270/294/406) without prop-drilling. Mirrors lib/circles/active-circle.ts exactly.
//
// The event body modules (components/widgets/events/*) are zero-prop RSCs bound in the widget
// registry, so a module needs another way to learn WHICH event it renders AND the per-viewer data
// the page already computed (poster details, cohosts, activity, recap, sales, gates). The detail
// page resolves all of it ONCE and stamps it here; every event module reads it back. No re-fetch,
// no prop-drilling. The fixed chrome (cover/title/subtitle header + the RSVP/ticket Join aside +
// the mobile action bar) stays in the page — only the post-area content is module-driven.
//
// REQUEST-SAFE: `cache()` (React.cache) gives a per-request memo cell, cleared between requests by
// the framework. A module that runs OUTSIDE an event detail route reads `null` and renders nothing.

import { cache, type ReactNode } from 'react'
import type { ActivityPost } from '@/components/events/event-activity'
import type { RecapPhoto } from '@/components/events/recap-album'
import type { CohostView } from '@/components/events/cohost-manager'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import type { EventMapPin } from '@/components/events/events-map'
import type { FactGuest } from '@/components/events/event-fact-panel'
import type { WarmProofAttendee } from '@/components/events/warm-proof'

/** The bits of the event a module needs (the page keeps the full row for its fixed header/Join). */
export interface EventLite {
  id: string
  slug: string
  title: string
  description: string | null
  is_cancelled: boolean
}

/** The event host's public identity, for the `event-lineup` Host profile module. Null when the
 *  event has no resolvable host (an unclaimed import), so that module self-hides. */
export interface HostLite {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

/** A succeeded ticket sale, for the host Sales module. */
export interface SoldTicket {
  id: string
  amount_cents: number
  qty: number
  status: string
  buyer: { display_name: string | null; handle: string | null } | null
}

/** The warm-proof social counts the page already computed, for the `event-warm-proof` module. */
export interface WarmProofData {
  going: number
  fromYourCircles: number
  maybe: number
  guests: number
  faces: WarmProofAttendee[]
  nearFull: boolean
  spotsLeft: number | null
}

/** The critical-info card inputs the page already computed, for the `event-facts` module. */
export interface EventFactsData {
  whenLine: string
  isOnline: boolean
  location: string | null
  /** Google Maps deep link for the venue (structured address when present, else the
   *  free-text location). Null for online events or when there is no address. */
  mapsHref: string | null
  onlineUrl: string | null
  mapPin: EventMapPin | null
  /** The event's OWN precise geog point — published + in-person + geocoded, else null. */
  venuePoint: { lat: number; lng: number } | null
  going: number
  nearFull: boolean
  spotsLeft: number | null
  guests: FactGuest[]
  /** Crew see the roster; others see only the count. */
  guestsAreVisible: boolean
  /** False for a signed-out visitor (drives the "Sign in to see who's coming" gate). */
  viewerSignedIn: boolean
  /** Sign-in URL that returns to this event after auth. */
  signInHref: string
}

export interface EventDetailContext {
  event: EventLite
  /** The event host's public profile, for the `event-lineup` Host profile module (null → self-hide). */
  host: HostLite | null
  myProfileId: string | null
  /** Holds event.editSettings — host, cohost-with-manage, circle manager, or admin. */
  canManage: boolean
  isHost: boolean
  isCohost: boolean
  /** May post an Event Dispatch (host or cohost). */
  canDispatch: boolean
  /** May add a comment / recap photo (host, cohost, or any RSVP holder). */
  canContribute: boolean
  isPast: boolean
  hasEnded: boolean
  /** The flexible poster harvest (lineup, schedule, links…) + signed URLs for its crops. */
  posterDetails: EventDetailsWithMedia
  posterCropUrls: Record<string, string>
  cohosts: CohostView[]
  /** Pending cohost invites (status 'invited') — the host's manager lists these to cancel. */
  cohostInvites: CohostView[]
  /** The event sells tickets (active tiers or a flat price) — gates the host Sales module. */
  isPaidEvent: boolean
  soldTickets: SoldTicket[]
  /** Event Dispatches + guest comments, merged newest-first. */
  activityPosts: ActivityPost[]
  recapPhotos: RecapPhoto[]
  // ── Movable Join-area modules (ADR — event interior fully templated). The page computes each
  // piece ONCE (the same gates/data the fixed aside used) and stamps it here, so the Join, Warm
  // proof, and Facts modules render it without re-deriving the ticketing/RSVP/capacity logic.
  /** The RSVP/ticket Join box, fully built + gated by the page (null on a cancelled event). The
   *  `event-join` module renders this node verbatim. */
  joinActions: ReactNode
  /** Inputs for the `event-warm-proof` module's <WarmProof> card. */
  warmProof: WarmProofData
  /** Inputs for the `event-facts` module's <EventFactPanel> card (incl. the exact-venue map). */
  facts: EventFactsData
}

interface Holder {
  ctx: EventDetailContext | null
}

// One holder per request (React.cache memoizes by args — no args = one cell per request).
const holder = cache((): Holder => ({ ctx: null }))

/** Stamp the active event context for this request (called once by the detail page). */
export function setEventContext(ctx: EventDetailContext): void {
  holder().ctx = ctx
}

/** The active event context for this request, or null off an event detail route (→ render nothing). */
export function getEventContext(): EventDetailContext | null {
  return holder().ctx
}
