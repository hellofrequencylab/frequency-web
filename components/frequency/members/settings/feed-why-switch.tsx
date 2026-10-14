'use client'

import { useState, useTransition } from 'react'
import { setFeedWhyShown } from './feed-why-actions'
import { fqToast } from '../shared/toast'

// "Show why I see things" as the kit's switch (.sw). A refused write rolls the switch back and says so.
export function FeedWhySwitch({ shown: initial }: { shown: boolean }) {
  const [shown, setShown] = useState(initial)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label="Show why I see things"
      className={shown ? 'sw on' : 'sw'}
      disabled={pending}
      onClick={() => {
        const next = !shown
        setShown(next)
        start(async () => {
          const res = await setFeedWhyShown(next)
          if (!res.ok) {
            setShown(!next)
            fqToast('That did not save. Try again.')
            return
          }
          fqToast(next ? 'The Feed shows why again.' : 'The Feed stops saying why.')
        })
      }}
    />
  )
}
