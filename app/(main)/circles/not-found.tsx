import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FqNotFound } from '@/components/frequency/members/community-states'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  if (SITE_DESIGN === 'frequency')
    return (
      <FqNotFound
        title="That Circle is not here"
        body="It may have moved, or the link is broken. Head back to all your Circles."
        href="/circles"
        cta="Back to Circles"
      />
    )
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
      <EmptyState
        variant="no-results"
        title="That circle isn't here"
        description="It may have moved, or the link's broken. Head back to all your circles."
        action={
          <Button asChild>
            <Link href="/circles">Back to circles</Link>
          </Button>
        }
      />
    </div>
  )
}
