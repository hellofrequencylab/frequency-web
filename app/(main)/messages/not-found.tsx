import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That conversation isn't here"
        description="It may have moved, or the link's broken. Head back to all your conversations."
        action={
          <Button asChild>
            <Link href="/messages">Back to messages</Link>
          </Button>
        }
      />
    </div>
  )
}
