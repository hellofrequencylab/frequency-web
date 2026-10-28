import { notFound } from 'next/navigation'
import { LaunchFlow } from '@/components/launch/launch-flow'
import { DashboardTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { flowHeading, flowView } from '@/lib/launch/flow'
import { loadSpotlightAnswers } from '@/lib/launch/flow-io'
import { readPendingLaunch } from '@/lib/launch/pending-io'
import { publishedView } from '@/lib/launch/published'
import { getActiveLaunch } from '@/lib/launch/store'

// The launch page (VLS-07, VLS-09): one page for the whole launch. The Spotlight form first; once it is published the
// same page shows the live preview, the form to change it, and the stages still to come. Open to a signed-out visitor:
// an account is asked for at Publish (the action holds their answers and sends them to sign in). Answers held from an
// earlier try fill the form again. Dark while LAUNCH_SYSTEM_ENABLED is off.
export default async function SpotlightStepPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const { e } = await searchParams
  const profileId = await getMyProfileId()
  const launch = profileId ? await getActiveLaunch(profileId) : null
  const view = flowView(launch)
  const saved = view.slug ? await loadSpotlightAnswers(launch) : null
  const typed = (await readPendingLaunch())?.answers.spotlight
  const held = saved ?? (typed ? { name: typed.name ?? '', line: typed.line ?? '', link: typed.link ?? '' } : null)
  const pv = launch && view.slug ? publishedView(launch, 'spotlight') : null
  const published = pv?.kind === 'done' && view.slug ? { ...pv, next: { label: 'Your Space', href: `/spaces/${encodeURIComponent(view.slug)}` } } : undefined
  return (
    <DashboardTemplate {...flowHeading(view)} adminBar={false} width="default">
      <LaunchFlow view={view} answers={held} errorCode={typeof e === 'string' ? e : undefined} signedIn={!!profileId} published={published} />
    </DashboardTemplate>
  )
}
