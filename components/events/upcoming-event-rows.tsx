import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// The shared row list every "upcoming events" block renders: a date chip, the title, the when
// line, and the place. Extracted from upcoming-widget.tsx (unchanged markup) so the Channel
// widget and the Circle page's Upcoming events module read identically instead of drifting.

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
        <Link
          key={event.id}
          href={`/events/${event.slug}`}
          className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-3 hover:border-primary-bg dark:hover:border-primary hover:bg-primary-bg/30 dark:hover:bg-primary-bg transition-colors"
        >
          <DateChip iso={event.starts_at} />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-semibold text-text truncate">{event.title}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-meta text-subtle">
                {formatShort(event.starts_at)} · {formatTime(event.starts_at)}
              </span>
              {event.location && (
                <span className="flex items-center gap-0.5 text-meta text-subtle">
                  <MapPin className="w-3 h-3" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
          <span className="text-meta text-subtle shrink-0">→</span>
        </Link>
      ))}
    </div>
  )
}

/** A dimension-matched placeholder for a streaming row list (PAGE-FRAMEWORK §5.4): the same
 *  row height and rhythm as `UpcomingEventRows`, so nothing shifts when the real rows arrive. */
export function UpcomingEventRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-card" />
      ))}
    </div>
  )
}
