'use client'

import Link from 'next/link'
import { CalendarDays, MapPin, Pencil } from 'lucide-react'
import { CancelToggle } from './events-client'
import type { AdminEvent } from './load-events'

// Presentational event list shared by the /admin/events page and the in-place
// Spaces·Events module (ADR-138). Upcoming events with cancel/reinstate; past ones
// tucked behind a disclosure.

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function EventsAdminList({ upcoming, past }: { upcoming: AdminEvent[]; past: AdminEvent[] }) {
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <CalendarDays className="mx-auto mb-3 h-8 w-8 text-subtle/60" />
        <p className="text-sm text-muted">No events yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Upcoming</p>
          {upcoming.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium text-subtle hover:text-muted">
            {past.length} past event{past.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2 opacity-70">
            {past.slice(0, 20).map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function EventRow({ event }: { event: AdminEvent }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
      {/* Date chip */}
      <div className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-surface-elevated py-1.5 text-center">
        <span className="text-xs font-semibold uppercase leading-none text-subtle">
          {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="mt-0.5 text-lg font-black leading-none text-text">
          {new Date(event.starts_at).getDate()}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/events/${event.slug}`}
            className="truncate text-sm font-semibold text-text hover:text-primary-strong dark:hover:text-primary-strong"
          >
            {event.title}
          </Link>
          {event.is_cancelled && (
            <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger dark:bg-danger-bg">
              Cancelled
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
          <span>
            {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
          </span>
          {event.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      <Link
        href={`/admin/events/${event.id}`}
        className="shrink-0 rounded-lg border border-border p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        aria-label="Edit event"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <CancelToggle id={event.id} isCancelled={event.is_cancelled ?? false} />
    </div>
  )
}
