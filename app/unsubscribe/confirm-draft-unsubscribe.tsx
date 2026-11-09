'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { processDraftUnsubscribe } from './actions'
import { isError } from '@/lib/action-result'
import { UnsubscribeFrame, Body } from './card'
import { Button, buttonClasses } from '@/components/ui/button'

// The Create a Space draft confirm step (LIVE-1968). Same shape as confirm-unsubscribe.tsx: a GET only shows this
// button, and `processDraftUnsubscribe` runs from the server action the click invokes. The draft's own signed link is
// the whole authorisation (there is no account yet). The draft itself stays saved and private; only the notes stop.

export function ConfirmDraftUnsubscribe({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await processDraftUnsubscribe({ token })
      if (isError(res)) setError(res.error || 'Could not save that. Please try again.')
      else setDone(true)
    })
  }

  if (done) {
    return (
      <UnsubscribeFrame title="No more notes about your draft." description="We will not email you about it again.">
        <Body>Your draft stays saved and private. Open it any time from the link in your email, and change anything you like.</Body>
        <div className="pt-3">
          <Link href={`/create-a-space?draft=${encodeURIComponent(token)}`} className={buttonClasses('primary', 'md')}>Open my draft</Link>
        </div>
      </UnsubscribeFrame>
    )
  }

  if (error) {
    return (
      <UnsubscribeFrame title="Could not turn these off" description={error}>
        <Body>If you got here from an email, reply to it and we will help.</Body>
      </UnsubscribeFrame>
    )
  }

  return (
    <UnsubscribeFrame title="Stop the notes about your draft?" description="You will stop getting the reminders about the Space you started on Frequency. The draft itself stays saved and private.">
      <div className="pt-3">
        <Button type="button" onClick={confirm} disabled={isPending}>
          {isPending ? 'Turning off' : 'Turn these off'}
        </Button>
      </div>
    </UnsubscribeFrame>
  )
}
