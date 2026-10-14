import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { FqNotFound } from '@/components/frequency/members/community-states'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // Under Frequency the dead end is the kit's (a Spotlight wears no site shell, so the body frame
  // stamps the kit scope itself). DAWN below is unchanged.
  if (SITE_DESIGN === 'frequency')
    return (
      <MembersBody>
        <FqNotFound
          title="That Spotlight is not here"
          body="It may be private, or the link is broken. Explore more of Frequency."
          href="/discover"
          cta="Explore Frequency"
        />
      </MembersBody>
    )
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
