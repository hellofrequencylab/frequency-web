'use client'
import { RouteError } from '@/components/ui/route-error'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
