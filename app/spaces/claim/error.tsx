'use client'
import { RouteError } from '@/components/ui/route-error'

// The render-error boundary for the claim route. Without it a throw fell to the ROOT boundary, which
// is written for a signed-in member — the wrong frame entirely for a business owner arriving from an
// emailed link with no account. Sibling of app/events/error.tsx.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="This page didn't load"
      description="It hit a snag on our end, not on yours. Try again, and the claim link will still work."
      homeHref="/spaces"
      homeLabel="Browse businesses"
      minH="min-h-[60vh]"
    />
  )
}
