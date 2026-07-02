import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That event isn't here"
        description="It may have ended, or the link's broken. See what else is on."
        action={
          <Button asChild>
            <Link href="/discover/events">Browse events</Link>
          </Button>
        }
      />
    </div>
  )
}
