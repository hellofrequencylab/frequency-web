'use client'

import { useState, useTransition } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { sendFriendRequest } from '@/app/(main)/people/friend-actions'
import { fqToast } from './toast'

// The design's data-swap buttons (Go|Going, Add|Added) as real actions: the RSVP and the friend
// request. A refused write rolls the label back and says so.

export function GoToggle({ eventId, slug, title, initial }: { eventId: string; slug: string; title: string; initial: boolean }) {
  const [going, setGoing] = useState(initial)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      className={going ? 'btn sm pa' : 'btn sm'}
      aria-pressed={going}
      disabled={pending}
      onClick={() => {
        const next = !going
        setGoing(next)
        start(async () => {
          const res = await setRsvpStatus(eventId, next ? 'going' : 'not_going', { slug })
          if (!res || 'error' in res) {
            setGoing(!next)
            fqToast(next ? `${title} takes its RSVP on the event page.` : 'That did not save. Try again.')
            return
          }
          fqToast(next ? `You’re going to ${title}.` : `Removed ${title} from your week.`)
        })
      }}
    >
      {going && <FqIcon name="checkin" />}
      {going ? 'Going' : 'Go'}
    </button>
  )
}

export function AddToggle({ profileId, name, initial }: { profileId: string; name: string; initial: 'none' | 'pending' | 'friends' }) {
  const [state, setState] = useState(initial)
  const [pending, start] = useTransition()
  if (state === 'friends') return <span className="t2">Connected</span>
  return (
    <button
      type="button"
      className="btn sm"
      disabled={pending || state === 'pending'}
      onClick={() => {
        setState('pending')
        start(async () => {
          const res = await sendFriendRequest(profileId)
          if ('error' in res) {
            setState('none')
            fqToast(res.error)
            return
          }
          fqToast(`Request sent to ${name.trim().split(/\s+/)[0]}.`)
        })
      }}
    >
      {state === 'pending' ? 'Added' : 'Add'}
    </button>
  )
}
