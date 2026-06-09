import Link from 'next/link'
import { CalendarPlus, CalendarDays, ExternalLink } from 'lucide-react'

// One-tap Add to Calendar — the highest-ROI attendance lever (EVENTS-SYSTEM §4,
// Law 1: implementation intentions). Surfaced right where someone RSVPs, and
// emphasised once they're 'going'. Presentational + server-friendly (no hooks):
// the page builds the URLs and passes them in.
//
//   • ICS download/subscribe → the existing `/events/<slug>/event.ics` route
//     (Apple Calendar, Outlook, any iCal app — and an .ics subscription).
//   • Google Calendar template URL → built from title/start/end/location.

export function buildGoogleCalendarUrl({
  title,
  startsAt,
  endsAt,
  description,
  location,
}: {
  title: string
  startsAt: string
  endsAt: string | null
  description?: string | null
  location?: string | null
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace('.000', '')
  const start = fmt(startsAt)
  const end = endsAt
    ? fmt(endsAt)
    : fmt(new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString())
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    ...(description ? { details: description } : {}),
    ...(location ? { location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export function AddToCalendar({
  icsHref,
  googleUrl,
  emphasis = false,
}: {
  /** The event's `.ics` route, e.g. `/events/<slug>/event.ics`. */
  icsHref: string
  /** A Google Calendar template URL — see `buildGoogleCalendarUrl`. */
  googleUrl: string
  /** Lead with a filled primary "Add to calendar" (use right after a 'going' RSVP). */
  emphasis?: boolean
}) {
  if (emphasis) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={icsHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          title="Apple Calendar, Outlook, and any iCal-compatible app"
        >
          <CalendarPlus className="h-4 w-4" />
          Add to calendar
        </Link>
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Google
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={icsHref}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface"
        title="Apple Calendar, Outlook, and any iCal-compatible app"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        Add to calendar (.ics)
      </Link>
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Add to Google Calendar
      </a>
    </div>
  )
}
