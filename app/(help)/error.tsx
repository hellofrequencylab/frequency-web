'use client'
import { RouteError } from '@/components/ui/route-error'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Under Frequency (build-time) the help center wears the site shell, so its boundary wears the kit's hero.
  if (SITE_DESIGN === 'frequency') {
    return (
      <SiteError
        error={error}
        reset={reset}
        lead="This page didn’t load. Try again, or head back to the help home."
        homeHref="/help"
        homeLabel="Help home"
      />
    )
  }
  return (
    <RouteError
      error={error}
      reset={reset}
      title="The help center hit a snag"
      description="This page didn't load. Try again, or head back to the help home."
      homeHref="/help"
      homeLabel="Help home"
      minH="min-h-[60vh]"
    />
  )
}
