import { MapPin } from 'lucide-react'
import { RowCard } from '@/components/cards/row-card'
import { Skeleton } from '@/components/ui/skeleton'

// The shared row list every "upcoming events" block renders: a date chip, the title, the when
// line, and the place. Extracted from upcoming-widget.tsx so the Channel widget and the Circle
// page's Upcoming events module read identically instead of drifting.
//
// The row itself is the kit's RowCard in LINK mode (docs/PAGE-FRAMEWORK.md: compose, never
// hand-roll): one event per row, the date chip as its `anchor`, the when/where line as its
// `meta`, and the chevron as the passive `trailing` figure. The skeleton below is
// dimension-matched to that composition, not to the markup this replaced.

export interface UpcomingEventRow {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
}

// starts_at is stored UTC-naive (the event's wall-clock kept as UTC parts — lib/events/datetime),
// so every formatter here pins timeZone:'UTC' / reads UTC parts. Without the pin these render in
// the SERVER's zone and every row shifts on a non-UTC runtime (same convention as the edit page's
// toInput round-trip).

export function formatShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function DateChip({ iso }: { iso: string }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = d.getUTCDate()
  return (
    <div className="flex flex-col items-center justify-center w-9 h-9 rounded-control bg-primary-bg text-primary-strong shrink-0">
      <span className="text-3xs font-semibold uppercase leading-none">{month}</span>
      <span className="text-body-sm font-bold leading-tight">{day}</span>
    </div>
  )
}

export function UpcomingEventRows({ events }: { events: UpcomingEventRow[] }) {
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <RowCard
          key={event.id}
          href={`/events/${event.slug}`}
          anchor={<DateChip iso={event.starts_at} />}
          title={event.title}
          meta={
            <>
              <span>
                {formatShort(event.starts_at)} · {formatTime(event.starts_at)}
              </span>
              {event.location && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </span>
              )}
            </>
          }
          trailing={<span className="text-meta text-subtle">→</span>}
        />
      ))}
    </div>
  )
}

/** A dimension-matched placeholder for a streaming row list (PAGE-FRAMEWORK §5.4): the same
 *  row height and rhythm as `UpcomingEventRows`, so nothing shifts when the real rows arrive.
 *
 *  It mirrors RowCard's LINK-mode box rather than guessing a single height, because the height
 *  is a composition: `px-5 py-4` on the surface, a 36px anchor beside a text column of
 *  `text-body leading-tight` (20px) + `mt-1.5` (6px) + `text-meta` (16px). A flat `h-16` was
 *  matched to the hand-rolled row this replaced, and would now be 12px short on every row —
 *  which is the whole failure mode a dimension-matched skeleton exists to prevent. Keep the
 *  placeholder blocks in step with RowCard if its zone rhythm ever changes. */
export function UpcomingEventRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-control" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-2/5 rounded-control" />
            <Skeleton className="mt-1.5 h-4 w-3/5 rounded-control" />
          </div>
        </div>
      ))}
    </div>
  )
}
