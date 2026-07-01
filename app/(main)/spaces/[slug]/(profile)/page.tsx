import { Suspense } from 'react'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// The profile's HOME page body, rendered through Puck (feature-block model). Every profile page —
// Home here, and each operator-defined custom page under [page] — is its OWN Puck document, resolved
// by SpaceLanding (Home = the `home` page slug). The identity Hero + operator nav + rail are the
// (profile) layout chrome; this is just the page body (children).
//
// The body is wrapped in its OWN <Suspense> with the shared profile-body skeleton, so the chrome never
// blocks on the Space read while the page doc resolves (D5).
export default async function SpaceLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <SpaceLanding slug={slug} />
    </Suspense>
  )
}
