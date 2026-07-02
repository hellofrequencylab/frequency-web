import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That spotlight isn't here"
        description="It may be private, or the link's broken. Explore more of Frequency."
        action={
          <Button asChild>
            <Link href="/discover">Explore Frequency</Link>
          </Button>
        }
      />
    </div>
  )
}
