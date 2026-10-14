'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SITE_DESIGN } from '@/lib/theme/design'
import '@/app/themes/active/members-a'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    // Report, don't just log: server renders are covered by instrumentation.ts
    // onRequestError, but a client-side throw caught HERE never reaches the root
    // reporting boundary (nearest-boundary-wins) - without this it was invisible.
    Sentry.captureException(error)
  }, [error])
  // Under Frequency the snag wears the Feed's own end-cap card (kit .soft, members-a.css .fa-end).
  if (SITE_DESIGN === 'frequency') {
    return (
      <div className="fa-col">
        <div className="soft fa-end" role="alert">
          <span className="fq-breathe" aria-hidden />
          <b>Your feed hit a snag.</b>
          <p>This part of your feed didn’t load. Try again, or head back to the top.</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn pa" onClick={reset}>
              Try again
            </button>
            <Link href="/feed" className="btn">
              Back to the feed
            </Link>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="error"
        title="Your feed hit a snag"
        description="This part of your feed didn't load. Try again, or head back to the top."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <Button asChild>
              <Link href="/feed">Back to feed</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
