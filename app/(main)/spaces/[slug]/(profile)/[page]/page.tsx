import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceBySlug } from '@/lib/spaces/store'
import { hasPage, readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// A custom operator-defined profile PAGE (feature-block model). The nav is operator-defined
// (preferences.pages); each page renders its OWN Puck doc. This dynamic segment resolves the page by
// slug and renders its doc through the same Puck path as Home (SpaceLanding). A slug that is NOT a
// declared page (or a reserved owner-route slug, which is a static sibling and wins routing anyway)
// 404s, so a random path never renders a stray default page. The identity Hero + nav chrome come from
// the (profile) layout; this is only the page body.

// Its OWN canonical + title, keyed on the operator's own page slug and label. Without this every
// custom page inherits the Space ROOT's metadata and declares itself a duplicate of the profile
// (FINALIZE-PLAN §9.5). A slug that is not a declared page gets the "not found" title the route
// already 404s with, so an unknown path never advertises a canonical.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; page: string }>
}): Promise<Metadata> {
  const { slug, page } = await params
  // getSpaceBySlug is the same request-cached anonymous read spaceProfileMetadata makes, so the
  // label lookup costs nothing extra.
  const space = await getSpaceBySlug(slug)
  const declared = space ? readProfilePages(space.preferences).find((p) => p.slug === page) : null
  if (!declared) return { title: 'Page not found' }
  // `home` renders the SAME doc as the profile index, so it is a real duplicate and points its
  // canonical at the root rather than at itself.
  if (declared.slug === HOME_SLUG) return spaceProfileMetadata(slug)
  return spaceProfileMetadata(slug, { segment: declared.slug, label: declared.label })
}

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
