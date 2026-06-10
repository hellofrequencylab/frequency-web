'use client'

import { Check, Plus, Clock } from 'lucide-react'
import { toggleRSVP } from '@/app/(main)/events/actions'

// One-tap RSVP for event cards — lowers friction to the gateway action. Floats
// over the card (its own form), so tapping it toggles the RSVP without navigating
// to the detail page. Going = success chip; not going = a quiet "RSVP" pill.
//
// Capacity-aware (EVENTS-SYSTEM §7): when an event is full, the same toggle joins
// the waitlist instead — framed as care, never scarcity. The server decides full /
// waitlisted and passes it in; the button never fetches. New props are OPTIONAL
// with safe defaults so existing call sites (the Events index) keep working.
export function RsvpButton({
  eventId,
  isGoing,
  isFull = false,
  isWaitlisted = false,
}: {
  eventId: string
  isGoing: boolean
  /** Event is at capacity — a fresh RSVP joins the waitlist. */
  isFull?: boolean
  /** Viewer is already on the waitlist (tap to leave). */
  isWaitlisted?: boolean
}) {
  // Already waitlisted: a calm "on waitlist · tap to leave" state.
  if (isWaitlisted) {
    return (
      <form action={toggleRSVP.bind(null, eventId)}>
        <button
          type="submit"
          aria-label="Leave waitlist"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
        >
          <Clock className="h-3.5 w-3.5" />
          On waitlist
        </button>
      </form>
    )
  }

  // Full + not in yet: the toggle joins the waitlist.
  if (isFull && !isGoing) {
    return (
      <form action={toggleRSVP.bind(null, eventId)}>
        <button
          type="submit"
          aria-label="Join waitlist"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-primary-bg hover:text-primary-strong"
        >
          <Clock className="h-3.5 w-3.5" />
          Join waitlist
        </button>
      </form>
    )
  }

  return (
    <form action={toggleRSVP.bind(null, eventId)}>
      <button
        type="submit"
        aria-label={isGoing ? 'Cancel RSVP' : 'RSVP, I’m going'}
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
          isGoing
            ? 'bg-success-bg text-success hover:bg-danger-bg hover:text-danger'
            : 'border border-border bg-surface text-muted hover:border-primary-bg hover:text-primary-strong'
        }`}
      >
        {isGoing ? <><Check className="h-3.5 w-3.5" />Going</> : <><Plus className="h-3.5 w-3.5" />RSVP</>}
      </button>
    </form>
  )
}
