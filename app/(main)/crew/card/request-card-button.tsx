'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestMemberCard } from './actions'

// "Ask for my card" on /crew/card (LIVE-1282). Files one pending request for the staff who write
// cards; a second press while one is pending is a no-op server side, so the button simply shows
// that it is in. Copy obeys CONTENT-VOICE.

export function RequestCardButton({ requested }: { requested: boolean }) {
  const [done, setDone] = useState(requested)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <p className="flex items-center gap-2 text-body-sm font-medium text-success">
        <Check aria-hidden className="h-4 w-4" /> You asked for a card. Pick it up at the next Frequency event or visit.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await requestMemberCard()
            if ('error' in r) setError(r.error)
            else setDone(true)
          })
        }
      >
        Ask for my card
      </Button>
      <span aria-live="polite" className="text-body-sm font-medium text-danger">
        {error}
      </span>
    </div>
  )
}
