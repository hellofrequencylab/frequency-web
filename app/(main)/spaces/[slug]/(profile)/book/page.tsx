import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { EntityCta } from '@/components/widgets/entity/entity-cta'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// THE RESERVED ACTION PAGE. In the feature-block profile, content pages are operator-composed Puck
// docs, but the TRANSACTIONAL surface (booking slot picker / membership join / donate / enroll /
// tickets, branched by Space type) stays a real interactive widget, not a static block. It lives here,
// at the reserved `book` slug, and is the destination of the profile's single primary CTA (best-practice
// one-CTA). The identity Hero + nav chrome come from the (profile) layout; this renders the action body
// only. `EntityCta` reads the active Space and renders the right surface for the type.
export default async function SpaceActionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <EntityCta />
    </Suspense>
  )
}
