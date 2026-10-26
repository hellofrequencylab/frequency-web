import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { FqNotFound } from '@/components/frequency/members/community-states'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  return (
      <FqNotFound
        title="That Circle is not here"
        body="It may have moved, or the link is broken. Head back to all your Circles."
        href="/circles"
        cta="Back to Circles"
      />
    )
}
