'use client'
import { RouteError } from '@/components/ui/route-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
