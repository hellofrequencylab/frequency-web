'use client'

import { useId, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { submitGuestRsvp } from '@/app/(main)/events/guest-rsvp-actions'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'

// THE SIGNED-OUT DOOR. What stood here was a link to /sign-in: someone followed a shared link,
// wanted to say they were coming, and was asked to make an account first. An account is a real
// ask, and it was standing in front of the one thing the page exists to collect.
//
// Email is the only required field. Name is optional and asked for the host's sake, not ours.
//
// ── THE REPLY IS ALWAYS THE SAME, AND THAT IS THE FEATURE ────────────────────────────────────────
// The action returns one identical success for every good-faith submission: it does not say
// whether the event was real, whether the room was full and the seat went to the waitlist, whether
// the host has to approve it, or whether that address had already RSVP'd. A seat is scoped to a
// NAMED, PUBLIC event, so a per-case message would answer "is this person going to this event" for
// anyone willing to type an address (20270303000100).
//
// So the confirmation below deliberately says LESS than a member's control does, and the copy has
// to carry that honestly rather than promise a seat we are not confirming. "We'll email you" is
// true on every path; "You're going" would not be.

/** What the reader sees after a successful submit. Same words on every path, by design. */
// Says only what is true on EVERY path. Not "you're going" (the room may have been full and the
// seat may be a waitlist hold) and not "confirm your spot" (nothing is pending — the seat is
// already written). The email itself is where going-vs-waitlist is stated, because that goes to
// the address in question rather than to whoever is looking at this screen.
const CONFIRMATION = {
  heading: 'Check your email',
  body: 'We sent the details there, including whether the room had space. No account needed.',
} as const

export function GuestRsvpForm({ eventId, isFull }: { eventId: string; isFull?: boolean }) {
  const fieldId = useId()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <div
        // Announced rather than silently swapped: the submit button is gone by the time this
        // renders, so a screen reader user has nothing left to move back to.
        role="status"
        className="flex items-start gap-2.5 rounded-card bg-success-bg px-4 py-3 text-success"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body-sm font-semibold">{CONFIRMATION.heading}</p>
          <p className="text-meta">{CONFIRMATION.body}</p>
        </div>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setError(null)
        startTransition(async () => {
          const result = await submitGuestRsvp({
            eventId,
            email: String(data.get('email') || ''),
            name: String(data.get('name') || ''),
            company: String(data.get('company') || ''),
          })
          if (result.ok) setDone(true)
          else setError(result.error)
        })
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`${fieldId}-email`}>Email</Label>
          <Input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            // The error is text next to the field, not a colour change alone, and the field
            // points at it so it is read on focus rather than only seen.
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={`${fieldId}-name`}>
            Name <span className="font-normal text-subtle">(optional)</span>
          </Label>
          <Input id={`${fieldId}-name`} name="name" type="text" autoComplete="name" placeholder="First name" />
        </div>
      </div>

      {/* Honeypot. Hidden from sight AND from the accessibility tree AND from tab order, so no
          real person can reach it by any route — a bot filling it is therefore unambiguous.
          `aria-hidden` alone would still leave it tabbable, which is how these turn into a trap
          for keyboard users instead of for bots. It stays a real text Input rather than
          type="hidden" because a bot that fills forms fills text fields; a hidden input would
          never be touched and the trap would catch nothing. */}
      <div aria-hidden="true" className="hidden">
        <Label htmlFor={`${fieldId}-company`}>Company</Label>
        <Input id={`${fieldId}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* `loading` rather than a label swap: the primitive marks the control aria-busy and
            disables it while keeping the label the same width, which is the one thing a pending
            state must not change (INTERACTION-STATES §4 rule 3). */}
        <Button type="submit" loading={pending}>
          {isFull ? 'Join the waitlist' : "I'm coming"}
        </Button>
        <p className="text-meta text-muted">
          No account needed. {isFull ? 'The room is full, so this holds your place in line.' : 'Free to join.'}
        </p>
      </div>

      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
