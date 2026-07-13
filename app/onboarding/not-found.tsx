import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="We couldn't find that step"
        description="This page doesn't exist, or it may have moved. Head back home."
        action={
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    </div>
  )
}
