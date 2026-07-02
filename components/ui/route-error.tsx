'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

// Shared body for a route-group error.tsx boundary. Each group's error.tsx stays a
// one-liner ('use client' + <RouteError .../>): this centralizes the logging, the
// EmptyState chrome, the retry, and the home link so the ~dozen boundaries don't drift.
// Copy per docs/CONTENT-VOICE.md: plain, warm, no em dashes.
export function RouteError({
  error,
  reset,
  title,
  description,
  homeHref,
  homeLabel,
  minH = 'min-h-[40vh]',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title: string
  description: string
  homeHref: string
  homeLabel: string
  minH?: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className={`flex ${minH} flex-col items-center justify-center px-4`}>
      <EmptyState
        variant="error"
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <Button asChild>
              <Link href={homeHref}>{homeLabel}</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
