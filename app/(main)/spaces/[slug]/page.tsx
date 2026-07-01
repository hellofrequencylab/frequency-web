import { Suspense } from 'react'
import { SpaceLanding } from '@/components/spaces/space-landing'
import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// The entity profile's INDEX tab = the public LANDING, now rendered through Puck
// (ADR-476/472, Phase 1 of unifying every builder onto Puck). The landing BODY is a
// Puck document: the operator's published doc (spaces.preferences.puck) when present
// + valid, else the generated preset for the Space's resolved layout template. The
// Detail band + tab row + rail are the layout (app/(main)/spaces/[slug]/layout.tsx);
// this is just the body (children). The OTHER tabs (offerings/practices/community/
// book) still render their blueprint module sets via ProfileTabBody — they converge
// to Puck in a later phase.
//
// The body is wrapped in its OWN <Suspense> with the shared profile-body skeleton, so
// the band never blocks on the Space read while the landing resolves (D5).
export default async function SpaceLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <Suspense fallback={<ProfileBodySkeleton />}>
      <SpaceLanding slug={slug} />
    </Suspense>
  )
}
