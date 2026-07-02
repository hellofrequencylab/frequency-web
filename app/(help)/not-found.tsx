import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="We couldn't find that article"
        description="It may have moved, or the link's broken. Search, or head back to the help home."
        action={
          <Button asChild>
            <Link href="/help">Help home</Link>
          </Button>
        }
      />
    </div>
  )
}
