'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { leaveRoomWithFeedback } from '@/app/(main)/messages/rooms/leave-feedback'

export function LeaveRoomControl({ roomId }: { roomId: string }) {
  const router = useRouter()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inFlight = useRef(false)
  function leave() {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    start(async () => {
      try {
        const result = await leaveRoomWithFeedback(roomId)
        if ('error' in result) { setError(result.error); return }
        router.replace('/messages')
        router.refresh()
      } catch (error) {
        unstable_rethrow(error)
        // A transport failure has no trustworthy application detail to show.
        setError('Could not leave this room. Please try again.')
      } finally {
        inFlight.current = false
      }
    })
  }
  return (
    <div>
      <button type="button" className="btn sm" onClick={leave} disabled={pending} aria-describedby={error ? errorId : undefined}>
        {pending ? 'Leaving…' : 'Leave'}
      </button>
      {error && <p id={errorId} role="alert" className="t2">{error}</p>}
    </div>
  )
}
