'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteEvent, getEventDeletePlan } from '@/app/(main)/events/admin-actions'
import {
  UNKNOWN_DELETE_PLAN,
  deleteReachesOtherDates,
  deleteSeriesButtonLabel,
  deleteWarning,
  type EventDeletePlan,
} from '@/lib/events/delete-plan'
import { CancelEventButton } from './cancel-event-button'

// THE EVENT DANGER ZONE, beside the rail (LIVE-237). Three controls that are not fields, so they
// live next to the manifest-derived event.settings module rather than inside it (STUDIO.md: a
// non-field control goes beside the rail). Each came from a route this row retired:
//
//   Duplicate  → /events/new?duplicate=<id>, from /events/[slug]/edit. The create page re-checks
//                the edit capability on the source event.
//   Cancel     → cancelEvent, from /events/[slug]/edit (host-gated; attendees keep their RSVP
//                record, the event shows as cancelled). Hidden once the event is cancelled.
//   Delete     → deleteEvent, from /events/[slug]/settings (the shared DangerDelete control).
//
// 🔴 THE WARNING THIS FILE USED TO SHOW (LIVE-535). It read "If this event is part of a series, only
// this date is deleted." That is true of a CHILD occurrence and the exact opposite of what happens to
// the ANCHOR of one: `events.parent_event_id` is ON DELETE CASCADE, so deleting the first date takes
// every other date, and the RSVPs and check-ins under each of them, with it. A host tidying up a
// mistaken first Wednesday lost the whole Wednesday series having just read a sentence promising they
// would not. The sentence is now computed from what the delete would actually reach
// (lib/events/delete-plan.ts) and the action refuses the cascade unless it is asked for by name, so
// this surface cannot drift back out of step with it.
//
// A client component because DangerDelete takes a server-action closure, which cannot cross the
// RSC boundary from the page. Every action re-checks event.editSettings server-side; this render
// gate is UX and the action stays the authority.
export function EventDangerZone({
  eventId,
  slug,
  title,
  isCancelled,
}: {
  eventId: string
  slug: string
  title: string
  isCancelled: boolean
}) {
  // Starts UNKNOWN, never local: before the read lands this surface must not promise that the delete
  // is confined to one date, which is the promise that cost a series. The server refuses on the same
  // predicate, so a plan that never arrives costs a retry rather than a cascade.
  const [plan, setPlan] = useState<EventDeletePlan>(UNKNOWN_DELETE_PLAN)
  useEffect(() => {
    let active = true
    getEventDeletePlan(eventId)
      .then((p) => {
        if (active) setPlan(p)
      })
      .catch(() => {
        /* stays UNKNOWN_DELETE_PLAN, which keeps the honest "we could not check" sentence */
      })
    return () => {
      active = false
    }
  }, [eventId])

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-card border border-border bg-surface-elevated/40 p-4">
        <p className="text-body-sm font-semibold text-text">Duplicate this event</p>
        <p className="mt-0.5 text-meta text-muted">
          Start a new event prefilled from this one. The date defaults to today so you can set the next one.
        </p>
        <div className="mt-3">
          <Link
            href={`/events/new?duplicate=${eventId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate event
          </Link>
        </div>
      </div>

      <section>
        <SectionHeader title="Danger zone" />
        {!isCancelled && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger-bg/30 p-4">
            <p className="text-body-sm font-semibold text-text">Cancel this event</p>
            <p className="mt-0.5 text-meta text-muted">
              Marks the event cancelled for everyone. Attendees keep their RSVP record but the event
              shows as cancelled.
            </p>
            <div className="mt-3">
              <CancelEventButton eventId={eventId} slug={slug} title={title} />
            </div>
          </div>
        )}
        <div className="rounded-card border border-border bg-surface p-5 lift-1">
          <DangerDelete
            entity="event"
            warning={deleteWarning(plan)}
            onDelete={() =>
              deleteEvent(eventId, slug, deleteReachesOtherDates(plan) ? 'series' : 'thisDate')
            }
            confirmLabel={plan.isAnchor ? deleteSeriesButtonLabel(plan) : undefined}
            redirectTo="/events"
          />
        </div>
      </section>
    </div>
  )
}
