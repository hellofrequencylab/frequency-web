import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { finaleRefusalMessage, type FinaleProjection } from '@/lib/hunts/rally-finale'
import { formatEventDate } from '@/lib/utils'

// The finale panel on the player's Trail page (FH-031S). It shows what loadRallyFinale read from the
// Events tables: the host Event, how many places are left, and the player's seat or the reason there is
// none. The Event owns admission, so the only action here is a link to the Event page. There is never a
// button that claims, holds or buys a seat.

function placesLine(capacity: { capacity: number | null; spotsLeft: number | null; isFull: boolean }): string {
  if (capacity.capacity === null) return 'No limit on places.'
  if (capacity.isFull) return 'No places left.'
  return capacity.spotsLeft === 1 ? '1 place left.' : `${capacity.spotsLeft} places left.`
}

function seatLine(p: Extract<FinaleProjection, { kind: 'finale' }>): string {
  if (p.admission === 'ticket') return 'You have a ticket for the finale.'
  if (p.admission === 'rsvp') return 'You have an RSVP for the finale.'
  return 'You do not have a place at the finale yet.'
}

export function FinalePanel({ finale }: { finale: FinaleProjection | null }) {
  if (!finale || finale.kind === 'none') return null
  if (finale.kind === 'unavailable') {
    return (
      <section aria-labelledby="trail-finale" className="space-y-1 rounded-card border border-border bg-surface px-4 py-3">
        <h2 id="trail-finale" className="text-body font-semibold text-text">The finale</h2>
        <p className="text-body-sm text-muted">{finaleRefusalMessage(finale.access.reason)}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="trail-finale" className="space-y-2 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-finale" className="flex items-center gap-2 text-body font-semibold text-text">
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
        The finale: {finale.event.title}
      </h2>
      <p className="text-body-sm text-muted">
        {finale.event.startsAt ? `${formatEventDate(finale.event.startsAt)}. ` : ''}
        {placesLine(finale.capacity)}
      </p>
      <p className="text-body-sm text-text">{seatLine(finale)}</p>
      {finale.access.allowed ? (
        <p className="text-body-sm text-muted">
          {finale.attendance === 'host_marked' ? 'The host marked you there. The finale is yours.' : 'You finished the trail, so the finale is open to you.'}
        </p>
      ) : (
        <p className="text-body-sm text-muted">{finaleRefusalMessage(finale.access.reason)}</p>
      )}
      <Link href={`/events/${encodeURIComponent(finale.event.slug)}`} prefetch={false} className={buttonClasses('secondary', 'md')}>
        Open the event
      </Link>
    </section>
  )
}
