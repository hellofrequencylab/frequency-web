'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { FqErrorState } from '@/components/frequency/members/community-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    // Report, don't just log: server renders are covered by instrumentation.ts
    // onRequestError, but a client-side throw caught HERE never reaches the root
    // reporting boundary (nearest-boundary-wins) - without this it was invisible.
    Sentry.captureException(error)
  }, [error])
  return (
      <FqErrorState
        title="Circles did not load"
        body="This part of Circles hit a snag. Try again, or head back to all your Circles."
        href="/circles"
        cta="Back to Circles"
        reset={reset}
      />
    )
}
