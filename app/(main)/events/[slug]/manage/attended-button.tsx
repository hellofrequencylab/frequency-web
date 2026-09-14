'use client'

import { useState, useTransition } from 'react'
import { UserCheck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SeatRef } from '@/lib/events/attendance'
import { setSeatAttendedFromManage } from './attendance-actions'

// One tap to say the host saw this person (PROG-GD4). Works for every seat on the roster, a
// member, a guest RSVP or a ticket holder alike, because the mark lives on the seat row and not
// on a profile. Undo is beside it because a door is a busy place and a mis-tap should cost one
// more tap, not a support thread. The action pays nobody, so undoing it takes nothing back.
export function AttendedButton({
  eventId,
  slug,
  seat,
  attended,
}: {
  eventId: string
  slug: string
  seat: SeatRef
  attended: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (next: boolean) =>
    start(async () => {
      setError(null)
      const result = await setSeatAttendedFromManage(eventId, slug, seat, next)
      if (!result.ok) setError('That did not save. Try again.')
    })

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {attended ? (
        <Button size="sm" variant="ghost" onClick={() => run(false)} disabled={pending} aria-label="Undo attended">
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </Button>
      ) : (
        <Button size="sm" variant="successOutline" onClick={() => run(true)} disabled={pending}>
          <UserCheck className="h-3.5 w-3.5" />
          {pending ? 'Marking…' : 'Mark attended'}
        </Button>
      )}
      {error && (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </span>
  )
}
