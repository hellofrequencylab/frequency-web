'use client'
import { RouteError } from '@/components/ui/route-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="This step hit a snag"
      description="Onboarding didn't load. Try again, or head back home."
      homeHref="/"
      homeLabel="Back home"
      minH="min-h-[60vh]"
    />
  )
}
