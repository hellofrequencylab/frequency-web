'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    // Report, don't just log: server renders are covered by instrumentation.ts
    // onRequestError, but a client-side throw caught HERE never reaches the root
    // reporting boundary (nearest-boundary-wins) - without this it was invisible.
    Sentry.captureException(error)
  }, [error])
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="error"
        title="Circles didn't load"
        description="This part of Circles hit a snag. Try again, or head back to all your circles."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <Button asChild>
              <Link href="/circles">Back to circles</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
