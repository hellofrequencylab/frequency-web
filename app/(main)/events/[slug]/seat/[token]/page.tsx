import type { Metadata } from 'next'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { guestSeatState, loadGuestSeat, type SeatRpcClient } from '@/lib/events/guest-seat'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'
import { GuestSeatForm } from './seat-form'

// THE GUEST'S SEAT PAGE (PROG-GD2). Reached from the one link in the receipt email.
//
// ── THE GET DOES NOTHING ─────────────────────────────────────────────────────────────────────────
// Mail scanners pre-click links. This page RENDERS the seat's state and waits for a submit; it
// never acts on arrival. Its only database call is read_guest_seat, a STABLE function (Postgres
// refuses a write inside one), through loadGuestSeat, and the source-shape test beside this file
// pins that no action, mutation or write-bearing rpc is imported or called here. Every change to
// the seat goes through seat-actions.ts, on a tap.
//
// ── THE NEUTRAL PAGE ─────────────────────────────────────────────────────────────────────────────
// A malformed, wrong, expired, released or claimed token, and a token whose seat belongs to some
// other event than this URL names, all render the same page with the same words. The token is
// 122 bits of randomness; there is nothing to enumerate and nothing this page will say about which
// of those it was. It links to the event page, which the URL already names.
//
// ── WHAT IS NEVER HERE (ADR-854) ─────────────────────────────────────────────────────────────────
// No address, venue, host or other attendee: the SQL returns none and the parser keeps none, so a
// hidden-address event (ADR-825) has nothing on this page to leak. The event page applies its own
// gate for whoever opens it.
//
// Under app/(main) on purpose: a signed-out guest gets the public chrome the event page already
// renders for anon viewers, and a FocusTemplate body keeps the global rail beside it (PAGE-FRAMEWORK
// §8.2, no lines in page-chrome.ts). Never indexed: the URL carries a capability.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your spot',
  robots: { index: false, follow: false },
}

const STATE_LINE = {
  going:     "You're going. No account needed to come along, just turn up.",
  waitlist:  "You're on the waitlist. If a spot opens we move you in and email you.",
  pending:   'The host approves each person for this one. Your request is with them, and you do not have a spot until they say yes.',
  not_going: 'This spot has been given back.',
} as const

export default async function GuestSeatPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>
}) {
  const { slug, token } = await params
  const supabase = await createClient()
  // The narrow rpc handle (ADR-246): the generated client keys `rpc` on the function-name union,
  // and the module beside the doors speaks the structural shape every guest door in this family
  // uses. Same seam as guest-rsvp-actions.ts.
  const seat = await loadGuestSeat(supabase as unknown as SeatRpcClient, token, slug)
  const eventHref = `/events/${encodeURIComponent(slug)}`

  if (!seat) {
    return (
      <FocusTemplate
        eyebrow="Your spot"
        title="This link is not active"
        description="It may have expired with the event, or the spot it opened was already given back. If you still hold a spot, the newest email about this event has a working link."
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={eventHref}>View event</Link>
          </Button>
        </div>
      </FocusTemplate>
    )
  }

  const state = guestSeatState(seat)
  const whenAbsolute = formatEventWhen(seat.startsAt, resolveZone(seat.timeZone))

  return (
    <FocusTemplate
      eyebrow="Your spot"
      title={seat.title}
      description={
        <>
          <span className="block font-medium text-text">{whenAbsolute}</span>
          <span className="block">{STATE_LINE[state]}</span>
        </>
      }
      back={{ href: eventHref, label: 'Event' }}
    >
      <GuestSeatForm
        token={token}
        slug={slug}
        state={state}
        plusOnes={seat.plusOnes}
        questions={seat.questions}
      />
    </FocusTemplate>
  )
}
