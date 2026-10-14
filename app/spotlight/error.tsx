'use client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { RouteError } from '@/components/ui/route-error'
import { SITE_DESIGN } from '@/lib/theme/design'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FqErrorState } from '@/components/frequency/members/community-error'

// Under Frequency the error face is the kit's, with the same report RouteError makes (a client throw
// caught here never reaches the root boundary). DAWN keeps RouteError, unchanged.
function FqSpotlightError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])
  return (
    <MembersBody>
      <FqErrorState
        title="This Spotlight did not load"
        body="It hit a snag on our end. Try again, or explore more of Frequency."
        href="/discover"
        cta="Explore Frequency"
        reset={reset}
      />
    </MembersBody>
  )
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (SITE_DESIGN === 'frequency') return <FqSpotlightError error={error} reset={reset} />
  return (
    <RouteError
      error={error}
      reset={reset}
      title="This spotlight didn't load"
      description="It hit a snag on our end. Try again, or explore more of Frequency."
      homeHref="/discover"
      homeLabel="Explore Frequency"
      minH="min-h-[60vh]"
    />
  )
}
