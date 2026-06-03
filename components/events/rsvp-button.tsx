'use client'

import { Check, Plus } from 'lucide-react'
import { toggleRSVP } from '@/app/(main)/events/actions'

// One-tap RSVP for event cards — lowers friction to the gateway action. Floats
// over the card (its own form), so tapping it toggles the RSVP without navigating
// to the detail page. Going = success chip; not going = a quiet "RSVP" pill.
export function RsvpButton({ eventId, isGoing }: { eventId: string; isGoing: boolean }) {
  return (
    <form action={toggleRSVP.bind(null, eventId)}>
      <button
        type="submit"
        aria-label={isGoing ? 'Cancel RSVP' : 'RSVP — I’m going'}
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
