'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="error"
        title="Community didn't load"
        description="This part of the Community hit a snag. Try again, or head back to the main view."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
            <Button asChild>
              <Link href="/network">Back to Community</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
