import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteStatus } from '@/components/frequency/site/shell/site-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // Under Frequency (build-time) a missing town, host or event type wears the kit's hero, with the ways
  // back into Discover that always exist. Static: no request data.
  if (SITE_DESIGN === 'frequency') {
    return (
      <SiteStatus
        crumb="Not found"
        title={
          <>
            We couldn’t <em className="fq-iri-text">find that.</em>
          </>
        }
        lead="It may have moved, or the link’s broken. A town or event type with nothing coming up has no page of its own."
      >
        <Link className="btn fq-iri-btn" href="/discover">
          Back to Discover
        </Link>
        <Link className="btn btn-ghost fq-iri-rim" href="/discover/events">
          What’s happening
        </Link>
        <Link className="btn btn-ghost fq-iri-rim" href="/discover/cities">
          Browse by town
        </Link>
      </SiteStatus>
    )
  }
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
