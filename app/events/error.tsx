'use client'
import { RouteError } from '@/components/ui/route-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="This didn't load"
      description="It hit a snag on our end. Try again, or browse what's on."
      homeHref="/discover/events"
      homeLabel="Browse events"
      minH="min-h-[60vh]"
    />
  )
}
