// The Event finale on the Trail page (FH-031S). It renders what lib/hunts/rally-finale.ts projects from
// the Events tables and nothing else. The Event owns admission, so this panel never claims, holds or
// promises a seat: it names the Event, the places left, the player's own seat or the reason there is
// none, and links to the Event page, where getting a ticket or an RSVP happens.
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { finaleRefusalMessage, type FinaleProjection } from '@/lib/hunts/rally-finale'
import { formatEventDateTime } from '@/lib/utils'

function placesLine(capacity: { capacity: number | null; spotsLeft: number | null; isFull: boolean }): string | null {
  if (capacity.capacity === null || capacity.spotsLeft === null) return null
  if (capacity.isFull) return 'No places left.'
  return `${capacity.spotsLeft} ${capacity.spotsLeft === 1 ? 'place' : 'places'} left.`
}

function seatLine(p: Extract<FinaleProjection, { kind: 'finale' }>): string {
  if (p.access.allowed) {
    const seat = p.access.via === 'ticket' ? 'Your ticket gets you in.' : 'Your RSVP gets you in.'
    return p.attendance === 'host_marked' ? `${seat} The host has you down as there.` : `${seat} See you at the finale.`
  }
  return finaleRefusalMessage(p.access.reason)
}

// Event times are stored as wall clock (lib/utils.ts), so the shared formatter reads them the same everywhere.
const when = (iso: string | null): string | null => (iso && !Number.isNaN(Date.parse(iso)) ? formatEventDateTime(iso) : null)

/** The finale panel, or nothing when the Trail has no finale. */
export function FinalePanel({ finale }: { finale: FinaleProjection | null }) {
  if (!finale || finale.kind === 'none') return null
  if (finale.kind === 'unavailable') {
    return (
      <section aria-labelledby="trail-finale" className="rounded-card border border-border bg-surface px-4 py-3">
        <h2 id="trail-finale" className="flex items-center gap-2 text-body font-semibold text-text">
          <CalendarDays className="h-4 w-4" aria-hidden />
          The finale
        </h2>
        <p className="text-body-sm text-muted">{finaleRefusalMessage(finale.access.reason)}</p>
      </section>
    )
  }
  const places = placesLine(finale.capacity)
  const starts = when(finale.event.startsAt)
  return (
    <section aria-labelledby="trail-finale" className="space-y-2 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-finale" className="flex items-center gap-2 text-body font-semibold text-text">
        <CalendarDays className="h-4 w-4" aria-hidden />
        The finale: {finale.event.title}
      </h2>
      {starts || places ? <p className="text-body-sm text-muted">{[starts, places].filter(Boolean).join('. ')}</p> : null}
      <p className="text-body-sm text-text">{seatLine(finale)}</p>
      <Link href={`/events/${encodeURIComponent(finale.event.slug)}`} prefetch={false} className={buttonClasses('secondary', 'md')}>
        Open the event page
      </Link>
    </section>
  )
}
