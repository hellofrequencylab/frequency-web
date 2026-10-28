import { notFound, redirect } from 'next/navigation'
import { PublishedScreen } from '@/components/launch/published-screen'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
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
  return (
    <FocusTemplate eyebrow="Be found" title={`Your ${view.label} is live`} description="It is up, in your own words. Look at it, or keep going." width="narrow">
      <PublishedScreen view={view} />
    </FocusTemplate>
  )
}
