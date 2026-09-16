'use client'

import { useJoinIntent } from './join-intent'
import { RsvpControls } from './rsvp-controls'

// THE ANSWER SWITCH ON A TICKETED EVENT (owner report 2026-09-16).
//
// ADR-826 gave an event one join function, and on a ticketed event that meant the RSVP switch did
// not render at all -- `page.tsx` returned `null` for a ticket holder and every `!ticketsMode &&`
// guard failed for everyone else. The owner reversed it: "RSVP buttons should always be visible",
// and a press with no ticket "goes grey and opens the ticket payment section".
//
// This component is the two-line adapter that needs to be a CLIENT component and therefore cannot
// live in the page: it reads the ticket door out of the join-intent context and hands `RsvpControls`
// the intercept. Everything else is `RsvpControls` unchanged.
//
// 🔴 THE INTERCEPT IS OFFERED ONLY WHEN A DOOR IS ACTUALLY LISTENING. `canRequestTickets()` is
// false when no `TicketButton` mounted -- sales closed, sold out, the host has no payout account,
// a manager's preview -- and in that case the switch falls back to an ORDINARY RSVP. That is the
// honest answer, not a degradation: with nothing to buy, saying you are coming is the only thing
// the page can mean, and greying a control that opens nothing is the dead UI this whole change is
// removing. A viewer who already holds a ticket also takes the ordinary path: their seat exists
// (the settle path mints it), so Going is already lit and pressing it steps back out like anywhere
// else.

export function TicketedRsvpControls({
  holdsTicket,
  rsvpWindowOpen,
  ...rest
}: Omit<Parameters<typeof RsvpControls>[0], 'goingNeedsTicket' | 'onGoingIntercept' | 'allowGoing'> & {
  /** Does this viewer already hold a succeeded ticket for this event? */
  holdsTicket: boolean
  /** Is the host's RSVP booking window open? (`lib/events/rsvp-window.ts`, read by the page.) */
  rsvpWindowOpen: boolean
}) {
  const joinIntent = useJoinIntent()
  // `hasDoor` is state on the provider, so this component re-renders once when the ticket door
  // finishes registering. Until then it renders the ordinary switch, which is the correct control
  // for every event that has no door at all.
  const doorIsOpen = !holdsTicket && !!joinIntent?.hasDoor
  // 🔴 A PRESS THAT THE SERVER WOULD SILENTLY REFUSE IS NOT OFFERED. `setRsvpStatus` returns
  // without writing when the host's booking window is shut and the intent is `going`
  // (app/(main)/events/actions.ts, the `!gate.windowOpen` gate), so a Going segment shown there
  // with nothing to intercept into would read as saved and have recorded nothing -- SCAN-557's
  // failure, which this repo has already paid for once.
  //
  // The window does NOT gate the intercept: with a door mounted the press opens checkout and never
  // reaches that action, and a ticket's own on-sale window is a different setting that the tickets
  // cascade above already enforces. Someone already holding a seat keeps the segment so they can
  // step back out of it -- closing RSVPs stops new answers, it does not lock people in.
  const held = holdsTicket || rest.status === 'going' || rest.status === 'waitlist'
  const allowGoing = doorIsOpen || rsvpWindowOpen || held
  return (
    <RsvpControls
      {...rest}
      allowGoing={allowGoing}
      goingNeedsTicket={doorIsOpen}
      onGoingIntercept={doorIsOpen ? () => joinIntent?.requestTickets() : null}
    />
  )
}

export default TicketedRsvpControls
