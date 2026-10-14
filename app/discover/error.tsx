'use client'
import { RouteError } from '@/components/ui/route-error'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Under Frequency (build-time) the boundary renders inside the site shell, so it wears the kit's hero.
  if (SITE_DESIGN === 'frequency') {
    return (
      <SiteError
        error={error}
        reset={reset}
        lead="This page hit a snag on our end. Try again, or head back to Discover."
        homeHref="/discover"
        homeLabel="Back to Discover"
      />
    )
  }
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Discover didn't load"
      description="This page hit a snag on our end. Try again, or head back to Discover."
      homeHref="/discover"
      homeLabel="Back to Discover"
      minH="min-h-[60vh]"
    />
  )
}
