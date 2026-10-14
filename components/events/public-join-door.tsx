import Link from 'next/link'
import { GuestRsvpForm } from '@/components/events/guest-rsvp-form'
import { GuestTicketForm } from '@/components/events/guest-ticket-form'
import type { PublicJoinDoor } from '@/lib/events/public-join-door'

// The join box a signed-out visitor gets on the public event page. The door itself is decided in
// lib/events/public-join-door.ts; this only draws it. The forms are the same ones the member page
// shows a signed-out reader, so a guest RSVP or a guest ticket works the same from either page, and
// the account is offered afterwards in the confirmation email, never in front of the RSVP or the
// purchase. Server component: the forms are the only client islands.

export function publicJoinHeading(door: PublicJoinDoor): string {
  if (door.kind === 'tickets') return 'Get your ticket'
  if (door.kind === 'rsvp') return 'Save your seat'
  if (door.kind === 'ended') return 'Catch the next one'
  return 'Join this event'
}

export function PublicJoinDoorBox({
  door,
  eventId,
  slug,
}: {
  door: PublicJoinDoor
  eventId: string
  slug: string
}) {
  const signInHref = `/sign-in?next=/events/${slug}`
  const line = (text: string) => <p className="text-body-sm text-muted">{text}</p>

  let body: React.ReactNode
  switch (door.kind) {
    case 'rsvp':
      body = <GuestRsvpForm eventId={eventId} isFull={door.isFull} note={door.note} />
      break
    case 'tickets':
      body = (
        <GuestTicketForm eventId={eventId} tiers={door.tiers} priceLabel={door.priceLabel} signInHref={signInHref} />
      )
      break
    case 'rsvp_closed':
    case 'tickets_closed':
    case 'not_ready':
      body = line(door.line)
      break
    case 'cancelled':
      body = line('This event was cancelled.')
      break
    case 'ended':
      body = (
        <div className="space-y-2">
          {line('This one has passed. Another gathering near you is already on the calendar.')}
          <Link href="/discover/events" className="font-medium text-primary-strong hover:underline">
            Find what is on next
          </Link>
        </div>
      )
      break
    case 'sign_in':
      body = (
        <div className="space-y-2">
          {line('Tickets for this one are for members.')}
          <Link href={signInHref} className="font-medium text-primary-strong hover:underline">
            Log in to get yours
          </Link>
        </div>
      )
      break
  }

  const offersGuestPath = door.kind === 'rsvp' || door.kind === 'tickets'
  return (
    <div className="space-y-3" data-public-join-door={door.kind}>
      {body}
      {offersGuestPath && (
        <p className="text-meta text-muted">
          Already on Frequency?{' '}
          <Link href={signInHref} className="font-medium text-primary-strong hover:underline">
            Log in
          </Link>
        </p>
      )}
    </div>
  )
}
