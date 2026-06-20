import { Suspense } from 'react'
import { ProfileTabBody } from '@/components/spaces/profile-tab-body'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// The entity profile's INDEX tab = About (ENTITY-SPACES-BUILD §B.1). Renders the blueprint's About
// module set via space-scoped <PageModules>. The Detail band + tabs are the layout; this is the
// body (children). Each module streams behind its own <Suspense> (PageModules), so the band never
// blocks on a slow section (D5).
//
// The body is wrapped here in its OWN <Suspense> with the shared profile-body skeleton (rather than
// a [slug]/loading.tsx, which would also become the fallback for the out-of-scope /settings routes):
// the About tab body paints a card-shaped placeholder while it resolves, matching the other tabs'
// loading.tsx, without touching settings.
export default async function SpaceAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <ProfileTabBody slug={slug} tabId="about" />
    </Suspense>
  )
}
