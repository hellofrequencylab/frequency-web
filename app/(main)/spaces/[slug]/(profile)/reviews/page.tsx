import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceReviews, getMySpaceReview } from '@/lib/spaces/content-data'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SpaceReviews } from '@/components/spaces/space-reviews'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'

// THE REVIEWS TAB (owner decision: reviews on their own tab). Public read (everyone sees the rating +
// reviews); a signed-in member who is NOT the owner leaves one review they can revise; an operator may
// hide a review and reply to it. The tab is gated on the Space's `reviews` FUNCTION being ON (an operator
// can turn it off); when disabled the route is notFound. Identity Hero + tab chrome come from the
// (profile) layout; this is the body.

// Its OWN canonical + title. Without this the tab inherits the Space ROOT's metadata and declares
// itself a duplicate of a page it is not (FINALIZE-PLAN §9.5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'reviews',
    label: 'Reviews',
    describe: (brandName) => `Ratings and reviews for ${brandName}, written by members.`,
  })
}

export default async function SpaceReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  // Reviews is a per-Space FUNCTION (default ON, an operator can switch it off). A missing def is
  // treated as enabled (fail-open on an unknown key); an explicit OFF hides the whole tab.
  const reviewsDef = spaceFunctionDef('reviews')
  if (reviewsDef && !spaceFunctionEnabled(space, reviewsDef)) notFound()

  const isOwner = !!space.ownerProfileId && space.ownerProfileId === viewerProfileId
  const [reviews, myReview, manage] = await Promise.all([
    getSpaceReviews(space.id),
    getMySpaceReview(space.id, viewerProfileId),
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
  ])

  return (
    <SpaceReviews
      slug={slug}
      spaceName={space.brandName ?? space.name}
      spaceLogoUrl={space.brandLogoUrl ?? null}
      reviews={reviews}
      myReview={myReview}
      signedIn={!!viewerProfileId}
      canReview={!!viewerProfileId && !isOwner}
      canModerate={manage.canManage}
      canRespond={manage.canManage}
    />
  )
}
