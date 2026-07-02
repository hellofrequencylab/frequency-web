import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="We couldn't find that"
        description="It may have moved, or the link's broken. Head back to Discover."
        action={
          <Button asChild>
            <Link href="/discover">Back to Discover</Link>
          </Button>
        }
      />
    </div>
  )
}
