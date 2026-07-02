import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That page isn't here"
        description="It may have moved, or the link's broken. Head back to the top."
        action={
          <Button asChild>
            <Link href="/feed">Back to feed</Link>
          </Button>
        }
      />
    </div>
  )
}
