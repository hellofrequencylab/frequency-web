'use client'
import { RouteError } from '@/components/ui/route-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
