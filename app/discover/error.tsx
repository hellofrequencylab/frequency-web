'use client'
import { SiteError } from '@/components/frequency/site/shell/site-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
