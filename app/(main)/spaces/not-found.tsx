import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That space isn't here"
        description="It may have moved, or the link's broken. Head back to all your spaces."
        action={
          <Button asChild>
            <Link href="/spaces/directory">Back to spaces</Link>
          </Button>
        }
      />
    </div>
  )
}
