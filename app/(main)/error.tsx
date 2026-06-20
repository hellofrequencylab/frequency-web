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
        title="Something went wrong on our end"
        description="This page hit a snag. Try again, or head back to your feed."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/feed">Back to feed</Link>
            </Button>
            <Button variant="secondary" onClick={reset}>
              Try again
            </Button>
          </div>
        }
      />
    </div>
  )
}
