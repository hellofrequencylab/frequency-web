'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

// ONE ROOM, TWO DOORS, AND THE ANSWER SWITCH KNOWS WHERE THE OTHER ONE IS (owner report 2026-09-16).
//
// ADR-826 gave an event ONE join function: a ticketed event showed the ticket cascade and the RSVP
// switch did not render at all. The owner reversed that half -- "RSVP buttons should always be
// visible", and pressing Going without a ticket "opens the ticket payment section" -- so the two
// now stand side by side and the RSVP switch has to be able to reach the ticket door.
//
// 🔴 WHY A CONTEXT AND NOT A PROP. The event page is a Server Component. `RsvpControls` and
// `TicketButton` are two separate client islands inside it, and a server component cannot hand a
// closure from one island to the other. This is the smallest seam that lets them meet: the ticket
// door REGISTERS how to open itself, the answer switch ASKS, and neither imports the other.
//
// ⚠️ TWO PIECES, AND THEY ARE DELIBERATELY DIFFERENT KINDS OF THING.
//
//   * The opener is a REF. It closes over the selected tier and the pending transition, so it is a
//     new function on every render of the ticket door. In state it would re-render every consumer
//     on every keystroke in the amount field, for a value nobody reads during render.
//   * `hasDoor` is STATE, and it has to be. Registration happens in the door's effect, which runs
//     AFTER the first commit -- so a consumer that only read the ref would render once with "no
//     door", decide the press records an ordinary RSVP, and never hear that a door had arrived.
//     The first version of this file did exactly that. The state is what re-renders the switch
//     once, into the right control.
//
// FAILS QUIET, BY DESIGN. `useJoinIntent()` returns null outside a provider and `requestTickets()`
// no-ops when no door has registered -- a free event has no ticket door, and an answer switch that
// threw there would take the whole page down to reach a button that does not exist. Consumers read
// `hasDoor` BEFORE offering the press, so the no-op is unreachable from the UI rather than merely
// survivable.

type Opener = () => void

interface JoinIntent {
  /** Open the ticket checkout, exactly as pressing the ticket CTA does. No-op with no door. */
  requestTickets: () => void
  /** Is a ticket door mounted and listening? Read this BEFORE offering the press. */
  hasDoor: boolean
  /** The ticket door calls this with its opener on every render, and with null on unmount. */
  registerTicketDoor: (open: Opener | null) => void
}

const JoinIntentContext = createContext<JoinIntent | null>(null)

export function JoinIntentProvider({ children }: { children: ReactNode }) {
  const opener = useRef<Opener | null>(null)
  const [hasDoor, setHasDoor] = useState(false)
  const registerTicketDoor = useCallback((open: Opener | null) => {
    opener.current = open
    // Guarded, because the door re-registers on EVERY render to keep the opener current. An
    // unguarded set would schedule a render from an effect that runs after every render, which is
    // the shape of a loop that only stops because React bails out on an identical value -- a thing
    // to rely on never, and especially not in a payment surface.
    setHasDoor((was) => (was === (open != null) ? was : open != null))
  }, [])
  const requestTickets = useCallback(() => {
    opener.current?.()
  }, [])
  const value = useMemo<JoinIntent>(
    () => ({ requestTickets, hasDoor, registerTicketDoor }),
    [requestTickets, hasDoor, registerTicketDoor],
  )
  return <JoinIntentContext.Provider value={value}>{children}</JoinIntentContext.Provider>
}

/** Null outside a provider — every consumer is optional by construction. */
export function useJoinIntent(): JoinIntent | null {
  return useContext(JoinIntentContext)
}
