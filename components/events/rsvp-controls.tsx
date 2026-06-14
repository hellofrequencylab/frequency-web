'use client'

import { useState, useTransition } from 'react'
import { Check, Clock, Star, Minus, Plus, UserPlus, X } from 'lucide-react'
import { setRsvpStatus, setRsvpPlusOnes } from '@/app/(main)/events/actions'
import { setEventRsvpDepth } from '@/app/(main)/events/[slug]/social-actions'

// Detail-page RSVP controls (event Detail template). Three warm states a member
// can move between — Going · Interested (maybe) · (Join waitlist when full) —
// plus a small "bringing guests" stepper once they're confirmed going.
//
// EVENTS-REWORK A1 depth (added): optional +1 NAMES (the host may require them),
// and "Request to join" for APPROVAL-REQUIRED events (invited guests skip the
// queue). Both ride the frozen rsvp-depth data layer via setEventRsvpDepth; the
// simple three-state toggle keeps using the existing lean actions so its capacity /
// email side-effects are untouched.
//
// Capacity-honest, never pushy (EVENTS-SYSTEM §4): the server decides full /
// waitlist and the page passes it in; this control never fetches. plus_ones is an
// informational headcount for the host — it does NOT consume seats. Self-authorized
// throughout: every action edits only the caller's own RSVP row.

const MAX_PLUS_ONES = 5

type Status = 'going' | 'maybe' | 'waitlist' | 'not_going'

export function RsvpControls({
  eventId,
  slug,
  status,
  plusOnes,
  isFull,
  requireNames = false,
  plusOneNames = [],
  requiresApproval = false,
  approvalStatus = 'none',
}: {
  eventId: string
  /** Needed for revalidation on the depth actions; optional for the lean toggle. */
  slug?: string
  /** The viewer's current RSVP status (null = no RSVP yet → 'not_going'). */
  status: Status | null
  /** Guests the viewer is bringing (only meaningful when going). */
  plusOnes: number
  /** Event is at capacity — a fresh "Going" joins the waitlist instead. */
  isFull: boolean
  /** Host requires the names of any +1s (A1). */
  requireNames?: boolean
  /** The viewer's saved +1 names (prefill). */
  plusOneNames?: string[]
  /** Event needs host approval to join (A1). Invited guests skip the queue. */
  requiresApproval?: boolean
  /** The viewer's approval state ('pending' shows the calm "request sent" line). */
  approvalStatus?: 'none' | 'pending' | 'approved'
}) {
  const [pending, startTransition] = useTransition()
  const [names, setNames] = useState<string[]>(plusOneNames)
  const current: Status = status ?? 'not_going'
  const isGoing = current === 'going'
  const isMaybe = current === 'maybe'
  const isWaitlisted = current === 'waitlist'
  const isPending = requiresApproval && approvalStatus === 'pending'

  const go = (intent: 'going' | 'maybe' | 'not_going') =>
    startTransition(() => {
      setRsvpStatus(eventId, intent)
    })

  // Approval-required join → write a 'pending' RSVP through the depth layer.
  const requestToJoin = () =>
    startTransition(() => {
      setEventRsvpDepth(eventId, slug ?? '', { status: 'going', approvalStatus: 'pending' })
    })

  const setGuests = (n: number) =>
    startTransition(() => {
      setRsvpPlusOnes(eventId, n)
    })

  // Save +1 names through the depth layer (keeps plus_ones in sync = names.length).
  const saveNames = (next: string[]) =>
    startTransition(() => {
      setEventRsvpDepth(eventId, slug ?? '', {
        status: 'going',
        plusOneNames: next.filter((n) => n.trim().length > 0),
      })
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

  // ── Approval-required, not yet in: a single "Request to join" button ──
  if (requiresApproval && !isGoing && !isWaitlisted && !isMaybe && !isPending) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={requestToJoin}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          Request to join
        </button>
        <p className="text-2xs text-subtle">The host approves who joins this one.</p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          <Clock className="h-4 w-4 text-subtle" />
          Request sent. The host will confirm.
        </p>
      </div>
    )
  }

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
          headcount for the host; doesn't take seats). With names required, the
          stepper is replaced by a name list so the count tracks the names. */}
      {isGoing && requireNames ? (
        <PlusOneNames pending={pending} names={names} setNames={setNames} onSave={saveNames} />
      ) : isGoing ? (
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
      ) : null}
    </div>
  )
}

// +1 names editor (shown when the host requires names). The +1 count IS the number
// of non-empty names, so the host always knows who is coming. Capped at MAX_PLUS_ONES.
function PlusOneNames({
  pending,
  names,
  setNames,
  onSave,
}: {
  pending: boolean
  names: string[]
  setNames: (n: string[]) => void
  onSave: (n: string[]) => void
}) {
  const update = (i: number, value: string) => {
    const next = [...names]
    next[i] = value
    setNames(next)
  }
  const remove = (i: number) => {
    const next = names.filter((_, idx) => idx !== i)
    setNames(next)
    onSave(next)
  }
  const add = () => {
    if (names.length >= MAX_PLUS_ONES) return
    setNames([...names, ''])
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-medium text-muted">Who are you bringing? The host needs names.</p>
      {names.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => update(i, e.target.value)}
            onBlur={() => onSave(names)}
            placeholder={`Guest ${i + 1}`}
            disabled={pending}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove guest"
            disabled={pending}
            className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:text-danger disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {names.length < MAX_PLUS_ONES && (
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a guest
        </button>
      )}
    </div>
  )
}
