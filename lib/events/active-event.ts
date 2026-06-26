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

import { cache } from 'react'
import type { ActivityPost } from '@/components/events/event-activity'
import type { RecapPhoto } from '@/components/events/recap-album'
import type { CohostView } from '@/components/events/cohost-manager'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'

/** The bits of the event a module needs (the page keeps the full row for its fixed header/Join). */
export interface EventLite {
  id: string
  slug: string
  title: string
  description: string | null
  is_cancelled: boolean
}

/** A succeeded ticket sale, for the host Sales module. */
export interface SoldTicket {
  id: string
  amount_cents: number
  qty: number
  status: string
  buyer: { display_name: string | null; handle: string | null } | null
}

export interface EventDetailContext {
  event: EventLite
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
  /** The event sells tickets (active tiers or a flat price) — gates the host Sales module. */
  isPaidEvent: boolean
  soldTickets: SoldTicket[]
  /** Event Dispatches + guest comments, merged newest-first. */
  activityPosts: ActivityPost[]
  recapPhotos: RecapPhoto[]
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
