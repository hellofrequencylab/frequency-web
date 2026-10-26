'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import '@/app/themes/active/members-a'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    // Report, don't just log: server renders are covered by instrumentation.ts
    // onRequestError, but a client-side throw caught HERE never reaches the root
    // reporting boundary (nearest-boundary-wins) - without this it was invisible.
    Sentry.captureException(error)
  }, [error])
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
