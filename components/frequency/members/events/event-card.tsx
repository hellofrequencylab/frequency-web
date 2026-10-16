import Link from 'next/link'
import { eventHostLabel } from '@/lib/events/platform-credit'
import type { EventRow, EventsIndexData } from '@/app/(main)/events/index-data'
import { formatWhen } from '@/app/(main)/events/index-data'
import { FqIcon } from '@/components/frequency/icon'
import { GoButton } from '@/components/frequency/members/go-button'
import { SHORT_MONTH_LABELS } from '@/lib/events/calendar-grid'
import { recurrenceLineFor } from '@/lib/events/recurrence'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { HOME_TZ, isEventPast } from '@/lib/time/zone'

// THE EVENTS CARD (templates/members/app/events.js `card()`, drawn in members-events.css `.ev-card`).
// Every field is the row the list already read: the cover and its focal point, the date block, the
// Live / Featured / Filling up / Waitlist badges (the DAWN card's own capacity rule), the when line
// with the series cadence, the going count against capacity, the price only where we may name one
// (EVT-PRICE-HONESTY: a null label prints nothing), the distance where it was measured, and who puts
// it on. The export's friend faces and "Audrey invited you" chip are not drawn: the listing read
// carries no who-of-yours-is-going or invite data, and a card never invents it.
//
// A ticketed event answers at the checkout on its own page (docs/CHECKOUT.md), never with a bare
// RSVP from a list, so its button is a link there; everything else gets the real Go / Going swap.

/** Is this a ticket sale (checkout on the event page) rather than an RSVP? */
function needsTicket(e: EventRow, priceLabel: string | null | undefined): boolean {
  if (!TICKETING_ENABLED || e.join_mode === 'rsvp') return false
  return e.join_mode === 'tickets' || (e.price_cents ?? 0) > 0 || (!!priceLabel && priceLabel !== 'Free')
}

/** Is it on right now (started, not yet ended), read in the community zone. */
export function isLive(e: EventRow, now: Date): boolean {
  return !!e.ends_at && isEventPast(e.starts_at, null, HOME_TZ, now) && !isEventPast(e.starts_at, e.ends_at, HOME_TZ, now)
}

function miles(m: number | null | undefined): string | null {
  if (typeof m !== 'number') return null
  return `${(m / 1609.344).toFixed(1)} mi`
}

export function FqEventCard({
  e,
  data,
  blurb,
}: {
  e: EventRow
  data: Pick<
    EventsIndexData,
    'coverUrls' | 'coverFocus' | 'rsvpCounts' | 'myRsvps' | 'priceLabels' | 'nowDate' | 'myProfileId' | 'circleNames'
  >
  /** The For you lane's plain "why" line. */
  blurb?: string | null
}) {
  const { coverUrls, coverFocus, rsvpCounts, myRsvps, priceLabels, nowDate, myProfileId, circleNames } = data
  const href = `/events/${e.slug}`
  const cover = coverUrls[e.id]
  const going = rsvpCounts[e.id] ?? 0
  const live = isLive(e, nowDate)
  const price = priceLabels[e.id]
  const ticket = needsTicket(e, price)
  const day = Number(e.starts_at.slice(8, 10))
  const mon = SHORT_MONTH_LABELS[Number(e.starts_at.slice(5, 7)) - 1]

  const left = e.capacity != null ? Math.max(0, e.capacity - going) : null
  const warm = left == null ? null : left === 0 ? 'Waitlist' : left <= (e.capacity ?? 0) * 0.2 ? 'Filling up' : null
  const repeat =
    e.recurrence_type && e.recurrence_type !== 'none' ? recurrenceLineFor(e) : e.parent_event_id ? 'Part of a series' : null
  const attendance = e.capacity != null ? `${going} of ${e.capacity} going` : going > 0 ? `${going} going` : 'Be the first'
  const dist = miles(e.distance_m)
  const mode = e.attendance_mode === 'online' ? 'Online' : e.attendance_mode === 'hybrid' ? 'In person + online' : null
  const circle = e.scope_type === 'circle' ? circleNames[e.scope_id] : undefined
  const hostName = eventHostLabel(e.host, e.host_space)

  return (
    <article className={e.is_cancelled ? 'ev-card off' : 'ev-card'}>
      <Link
        href={href}
        className="ev-cover"
        tabIndex={-1}
        aria-hidden="true"
        style={cover ? { backgroundImage: `url('${cover}')`, backgroundPosition: coverFocus[e.id] } : undefined}
      >
        <span className="ev-date">
          <b>{day}</b>
          <i>{mon}</i>
        </span>
        <span className="ev-badges">
          {e.is_cancelled && <span className="ev-badge mute">Cancelled</span>}
          {live && !e.is_cancelled && (
            <span className="ev-badge live">
              <span className="dot fq-breathe" />
              Live
            </span>
          )}
          {e.featured_at && (
            <span className="ev-badge feat">
              <FqIcon name="award" />
              Featured
            </span>
          )}
          {warm && !e.is_cancelled && <span className={warm === 'Waitlist' ? 'ev-badge mute' : 'ev-badge warm'}>{warm}</span>}
        </span>
      </Link>
      <div className="ev-b">
        <span className="ev-when">
          {live ? 'Happening now' : formatWhen(e.starts_at, nowDate)}
          {repeat && (
            <span>
              <FqIcon name="streak" />
              {repeat}
            </span>
          )}
        </span>
        <Link href={href} className="ev-t">
          {e.title}
        </Link>
        {blurb && <span className="ev-why">{blurb}</span>}
        <div className="ev-stats">
          <span>
            <FqIcon name="contacts" />
            {attendance}
          </span>
          {price && (
            <span className="ev-price">
              <FqIcon name="ticket" />
              {price}
            </span>
          )}
          {dist ? (
            <span>
              <FqIcon name="compass" />
              {dist}
            </span>
          ) : mode ? (
            <span>
              <FqIcon name="globe" />
              {mode}
            </span>
          ) : null}
        </div>
        <div className="ev-prov">
          {circle ? (
            <span className="ev-chip circ">{circle}</span>
          ) : e.is_public_standalone ? (
            <span className="ev-chip">
              <FqIcon name="globe" />
              {hostName ? `Public · ${hostName}` : 'Public'}
            </span>
          ) : hostName ? (
            <span className="ev-chip">{hostName}</span>
          ) : null}
          {e.location && (
            <span className="t2">
              <FqIcon name="pin" />
              {e.location}
            </span>
          )}
        </div>
        <div className="ev-foot">
          <span className="grow" />
          {e.is_cancelled ? null : ticket ? (
            <Link className="btn sm" href={href}>
              <FqIcon name="ticket" />
              {price ? `Tickets · ${price}` : 'Tickets'}
            </Link>
          ) : myProfileId ? (
            <GoButton eventId={e.id} slug={e.slug} going={myRsvps.has(e.id)} />
          ) : (
            <Link className="btn sm" href={href}>
              RSVP
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
