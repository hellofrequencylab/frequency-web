'use client'

import { useTransition } from 'react'
import { Check, Clock, Star, Minus, Plus } from 'lucide-react'
import { setRsvpStatus, setRsvpPlusOnes } from '@/app/(main)/events/actions'

// Detail-page RSVP controls (event Detail template). Three warm states a member
// can move between — Going · Interested (maybe) · (Join waitlist when full) —
// plus a small "bringing guests" stepper once they're confirmed going.
//
// Capacity-honest, never pushy (EVENTS-SYSTEM §4): the server decides full /
// waitlist and the page passes it in; this control never fetches. plus_ones is an
// informational headcount for the host — it does NOT consume seats. Self-authorized
// throughout: every action edits only the caller's own RSVP row.

const MAX_PLUS_ONES = 5

type Status = 'going' | 'maybe' | 'waitlist' | 'not_going'

export function RsvpControls({
  eventId,
  status,
  plusOnes,
  isFull,
}: {
  eventId: string
  /** The viewer's current RSVP status (null = no RSVP yet → 'not_going'). */
  status: Status | null
  /** Guests the viewer is bringing (only meaningful when going). */
  plusOnes: number
  /** Event is at capacity — a fresh "Going" joins the waitlist instead. */
  isFull: boolean
}) {
  const [pending, startTransition] = useTransition()
  const current: Status = status ?? 'not_going'
  const isGoing = current === 'going'
  const isMaybe = current === 'maybe'
  const isWaitlisted = current === 'waitlist'

  const go = (intent: 'going' | 'maybe' | 'not_going') =>
    startTransition(() => {
      setRsvpStatus(eventId, intent)
    })

  const setGuests = (n: number) =>
    startTransition(() => {
      setRsvpPlusOnes(eventId, n)
    })

  // The "Going" segment doubles as the waitlist CTA when the event is full and
  // the viewer isn't already confirmed/waitlisted — same intent, honest framing.
  const goingIsWaitlist = isFull && !isGoing && !isWaitlisted
  const goingLabel = isGoing
    ? 'Going'
    : isWaitlisted
      ? 'On waitlist'
      : goingIsWaitlist
        ? 'Join waitlist'
        : 'Going'
  const GoingIcon = isWaitlisted || goingIsWaitlist ? Clock : Check

  // Tapping the active segment again steps back out (toggle off) to 'not_going'.
  const onGoing = () => go(isGoing || isWaitlisted ? 'not_going' : 'going')
  const onMaybe = () => go(isMaybe ? 'not_going' : 'maybe')

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="RSVP"
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
      >
        <button
          type="button"
          onClick={onGoing}
          disabled={pending}
          aria-pressed={isGoing || isWaitlisted}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            isGoing
              ? 'bg-success-bg text-success'
              : isWaitlisted
                ? 'bg-surface-elevated text-muted'
                : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <GoingIcon className="h-4 w-4" />
          {goingLabel}
        </button>

        <button
          type="button"
          onClick={onMaybe}
          disabled={pending}
          aria-pressed={isMaybe}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            isMaybe
              ? 'bg-primary-bg text-primary-strong'
              : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          <Star className="h-4 w-4" />
          Interested
        </button>
      </div>

      {(isGoing || isWaitlisted) && (
        <p className="text-2xs text-subtle">
          {isWaitlisted
            ? 'You’re on the waitlist. Tap Going to step out. We’ll let you in if a spot opens.'
            : 'Tap Going again to undo.'}
        </p>
      )}

      {/* Plus-ones: only a confirmed attendee can bring guests (informational
          headcount for the host; doesn't take seats). */}
      {isGoing && (
        <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="text-sm font-medium text-muted">
            Bringing {plusOnes > 0 ? `+${plusOnes}` : 'no'} {plusOnes === 1 ? 'guest' : 'guests'}
          </span>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              aria-label="One fewer guest"
              onClick={() => setGuests(plusOnes - 1)}
              disabled={pending || plusOnes <= 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-primary-bg hover:text-primary-strong disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums text-text">
              {plusOnes}
            </span>
            <button
              type="button"
              aria-label="One more guest"
              onClick={() => setGuests(plusOnes + 1)}
              disabled={pending || plusOnes >= MAX_PLUS_ONES}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-primary-bg hover:text-primary-strong disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
