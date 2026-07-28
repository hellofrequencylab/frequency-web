import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { formatEventWhen } from '@/lib/time/zone'
import type { SeriesRailDate } from '@/lib/events/series-dates'

// The series date rail (ADR-897) — the next few real dates of a repeating event, each linking to
// that date's own page. Every occurrence keeps its own live, RSVP-able page; the rail is how a
// member reaches the ones the browse index no longer lists separately.
//
// SERVER COMPONENT (PAGE-FRAMEWORK §5): the timezone lib never ships to the client, so each date is
// formatted here in the event's own zone.

export function SeriesDatesRail({
  dates,
  timeZone,
  className,
}: {
  dates: SeriesRailDate[]
  /** The event's own time zone, so a date reads in the zone the host set it in. */
  timeZone: string | null
  className?: string
}) {
  // One date is just this event; there is nothing to offer.
  if (dates.length < 2) return null

  return (
    <section className={className} aria-labelledby="series-dates-heading">
      <h2 id="series-dates-heading" className="flex items-center gap-2 text-sm font-semibold text-text">
        <CalendarDays className="h-4 w-4 text-primary-strong" aria-hidden />
        Upcoming dates
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {dates.map((d) => {
          const label = formatEventWhen(d.startsAt, timeZone, { style: 'date', withZone: false })
          // The date being viewed is marked, not linked: a link to the page you are on is a dead end.
          if (d.isCurrent) {
            return (
              <li key={d.id}>
                <span
                  aria-current="page"
                  className="inline-flex items-center rounded-control border border-primary bg-primary-bg px-3 py-1.5 text-sm font-medium text-primary-strong"
                >
                  {label}
                </span>
              </li>
            )
          }
          return (
            <li key={d.id}>
              <Link
                href={`/events/${d.slug ?? ''}`}
                // The chip reads "Sat, Aug 8", which says WHEN but not that it is its own page with
                // its own RSVP. That is the one thing a member cannot infer from a date, so the
                // hover title says it rather than leaving the chip to imply it.
                title={`Go to ${label}, which has its own page and RSVP`}
                className="inline-flex items-center rounded-control border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary hover:text-text"
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
