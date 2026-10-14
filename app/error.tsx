'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // FREQUENCY (ADR-1737, build-time): the website's "hit a snag" hero in the site shell. SiteError
  // reports to Sentry itself, so the effect below is skipped on this branch (it would report twice).
  if (SITE_DESIGN === 'frequency') {
    return (
      <SiteShell>
        <SiteError error={error} reset={reset} lead="Something broke on our end. Try again, or head back home." />
      </SiteShell>
    )
  }
  return <DawnError error={error} reset={reset} />
}

function DawnError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // console.error alone meant a client-side throw was invisible to on-call: server
    // renders are covered by instrumentation.ts onRequestError, but a component that
    // throws during interaction or hydration produced no event, no alert, no digest.
    // This and app/error.tsx were the only two boundaries not reporting.
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <EmptyState
        variant="error"
        title="Something went wrong"
        description="Something broke on our end. Try again, or head back to your feed."
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
