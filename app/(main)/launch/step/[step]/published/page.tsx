import { notFound, redirect } from 'next/navigation'
import { LaunchFlow } from '@/components/launch/launch-flow'
import { DashboardTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { flowHeading, flowView } from '@/lib/launch/flow'
import { loadSpotlightAnswers } from '@/lib/launch/flow-io'
import { publishedView, stepFromSlug } from '@/lib/launch/published'
import { launchStepHref } from '@/lib/launch/steps'
import { getActiveLaunch } from '@/lib/launch/store'

// /launch/step/<step>/published (VLS-09): where a step lands once it has made its real thing. Read under the person's
// own session, so it only ever shows their own launch. A step that is not published sends them back to the step. Dark
// while LAUNCH_SYSTEM_ENABLED is off.
export default async function PublishedPage({ params }: { params: Promise<{ step: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const step = stepFromSlug((await params).step)
  if (!step) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const launch = await getActiveLaunch(profileId)
  if (!launch) redirect('/launch')
  const view = publishedView(launch, step)
  if (view.kind === 'not_yet') redirect(launchStepHref(step))
  const flow = flowView(launch)
  // The next step on this page is the person's own Space, which exists the moment the Spotlight is published.
  const published = flow.slug ? { ...view, next: { label: 'Your Space', href: `/spaces/${encodeURIComponent(flow.slug)}` } } : view
  return (
    <DashboardTemplate {...flowHeading(flow)} adminBar={false} width="default">
      <LaunchFlow view={flow} answers={await loadSpotlightAnswers(launch)} signedIn published={published} />
    </DashboardTemplate>
  )
}
