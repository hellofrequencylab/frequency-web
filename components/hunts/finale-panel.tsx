// THE FINALE PANEL (FH-031S): what a player sees about the Event their Trail ends at. A Server
// Component over the read model (lib/hunts/rally-finale.ts): the Event, the places left, the player's
// own seat or the reason there is none, and a link to the Event page. The Event owns admission, so
// there is no button here that claims, holds or asks for a seat: the only way in is the Event page.

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { finaleRefusalMessage, type FinaleProjection } from '@/lib/hunts/rally-finale'

const WHEN = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })

const SEAT = { ticket: 'You have a ticket for the finale.', rsvp: 'You are on the list for the finale.' } as const

function placesLine(capacity: { capacity: number | null; spotsLeft: number | null; isFull: boolean }): string | null {
  if (capacity.capacity === null || capacity.spotsLeft === null) return null
  if (capacity.isFull) return 'Full'
  return `${capacity.spotsLeft} ${capacity.spotsLeft === 1 ? 'place' : 'places'} left`
}

export function FinalePanel({ finale }: { finale: FinaleProjection | null }) {
  if (!finale || finale.kind === 'none') return null
  if (finale.kind === 'unavailable') {
    return (
      <section aria-labelledby="trail-finale" className="rounded-card border border-border bg-surface px-4 py-3">
        <h2 id="trail-finale" className="text-body font-semibold text-text">The finale</h2>
        <p className="text-body-sm text-muted">{finaleRefusalMessage('event_unavailable')}</p>
      </section>
    )
  }
  const { event, capacity, admission, access } = finale
  const places = placesLine(capacity)
  const seat = admission === 'ticket' || admission === 'rsvp' ? SEAT[admission] : null
  return (
    <section aria-labelledby="trail-finale" className="space-y-2 rounded-card border border-border bg-surface px-4 py-3">
      <h2 id="trail-finale" className="text-body font-semibold text-text">The finale: {event.title}</h2>
      <p className="text-body-sm text-muted">
        {event.startsAt ? WHEN.format(new Date(event.startsAt)) : 'Date to come'}
        {places ? `. ${places}` : ''}
      </p>
      {seat ? <p className="text-body-sm text-text">{seat}</p> : null}
      {access.allowed ? (
        <p className="text-body-sm text-text">You finished the trail and you have your place. See you there.</p>
      ) : (
        <p className="text-body-sm text-text">{finaleRefusalMessage(access.reason)}</p>
      )}
      <Link href={`/events/${encodeURIComponent(event.slug)}`} prefetch={false} className={buttonClasses('secondary', 'md')}>
        Open the event page
      </Link>
    </section>
  )
}
