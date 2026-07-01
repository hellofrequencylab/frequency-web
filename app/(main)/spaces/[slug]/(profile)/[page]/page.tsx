import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { hasPage } from '@/lib/spaces/profile-pages'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// A custom operator-defined profile PAGE (feature-block model). The nav is operator-defined
// (preferences.pages); each page renders its OWN Puck doc. This dynamic segment resolves the page by
// slug and renders its doc through the same Puck path as Home (SpaceLanding). A slug that is NOT a
// declared page (or a reserved owner-route slug, which is a static sibling and wins routing anyway)
// 404s, so a random path never renders a stray default page. The identity Hero + nav chrome come from
// the (profile) layout; this is only the page body.
export default async function SpaceCustomPage({
  params,
}: {
  params: Promise<{ slug: string; page: string }>
}) {
  const { slug, page } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space || !hasPage(space.preferences, page)) notFound()

  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <SpaceLanding slug={slug} pageSlug={page} />
    </Suspense>
  )
}
