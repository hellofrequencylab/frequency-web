import Link from 'next/link'
import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SiteStatus } from '@/components/frequency/site/shell/site-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
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
