'use client'

import { useState, useTransition } from 'react'
import { Check, Zap } from 'lucide-react'
import { checkInEvent, type CheckInResult } from '../actions'

// "Log practice" check-in for an event the viewer RSVP'd to → emits
// practice.verified (the North-Star event) and awards zaps + a streak tick.
export function EventCheckInButton({ eventId }: { eventId: string }) {
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [pending, start] = useTransition()

  if (result?.ok) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl bg-success-bg text-success px-4 py-2.5 text-sm font-semibold">
        <Check className="w-4 h-4" />
        {result.alreadyCheckedIn
          ? 'Checked in · practice logged'
          : `Checked in! +${result.zapsAwarded ?? 0} zaps`}
      </div>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() => start(async () => setResult(await checkInEvent(eventId)))}
      className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-5 py-2.5 shadow-sm transition-colors disabled:opacity-60"
    >
      <Zap className="w-4 h-4" strokeWidth={2.5} />
      {pending ? 'Checking in…' : 'Check in · log practice'}
    </button>
  )
}
