import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceReviews, getMySpaceReview } from '@/lib/spaces/content-data'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SpaceReviews } from '@/components/spaces/community/space-reviews'

// THE REVIEWS TAB (owner decision: reviews on their own tab). Public read (everyone sees the rating +
// reviews); a signed-in member who is NOT the owner leaves one review they can revise; the operator may
// hide a review. Identity Hero + tab chrome come from the (profile) layout; this is the body.
export default async function SpaceReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const isOwner = !!space.ownerProfileId && space.ownerProfileId === viewerProfileId
  const [reviews, myReview, manage] = await Promise.all([
    getSpaceReviews(space.id),
    getMySpaceReview(space.id, viewerProfileId),
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
  ])

  return (
    <SpaceReviews
      slug={slug}
      brandName={space.brandName ?? space.name}
      reviews={reviews}
      myReview={myReview}
      signedIn={!!viewerProfileId}
      canReview={!!viewerProfileId && !isOwner}
      canModerate={manage.canManage}
    />
  )
}
