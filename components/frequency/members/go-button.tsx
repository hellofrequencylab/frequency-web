'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { isError } from '@/lib/action-result'

// THE "GO / GOING" SWAP, MADE REAL (Frequency member kit, templates/members/Events.html). The
// reference toggles a label with `data-swap="Go|Going" data-cls="pa"`; here the press writes the
// viewer's own RSVP through `setRsvpStatus`, the same lean action the event page's RSVP control
// uses, so every server gate (booking window, capacity, approval, cancelled) still decides. The
// label flips at once and settles back if the write is refused; a refresh then reads the true row.
//
// It sits inside a row that is itself a link to the event, so the press stops the navigation.

export function GoButton({
  eventId,
  slug,
  going,
}: {
  eventId: string
  slug: string
  /** The viewer's real answer: true when their RSVP row says going. */
  going: boolean
}) {
  const router = useRouter()
  const [on, setOn] = useState(going)
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)

  function press(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !on
    setOn(next)
    setFailed(false)
    start(async () => {
      const res = await setRsvpStatus(eventId, next ? 'going' : 'not_going', { slug })
      if (res && isError(res)) {
        setOn(!next)
        setFailed(true)
        return
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      className={on ? 'btn sm pa' : 'btn sm'}
      aria-pressed={on}
      disabled={pending}
      onClick={press}
      title={failed ? 'We could not save that. Try again.' : undefined}
    >
      {on ? 'Going' : 'Go'}
    </button>
  )
}
