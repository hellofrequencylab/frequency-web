import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { MemberNotFound } from '@/components/frequency/members/member-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // FREQUENCY (ADR-1737, build-time): the members kit's status room with ways back in. DAWN unchanged.
  if (SITE_DESIGN === 'frequency') return <MemberNotFound />
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="We couldn't find that"
        description="This page doesn't exist, or it may have moved. Head back to your feed."
        action={
          <Button asChild>
            <Link href="/feed">Back to feed</Link>
          </Button>
        }
      />
    </div>
  )
}
