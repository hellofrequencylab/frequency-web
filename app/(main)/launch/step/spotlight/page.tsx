import { notFound } from 'next/navigation'
import { LaunchFlow } from '@/components/launch/launch-flow'
import { DashboardTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { flowHeading, flowView } from '@/lib/launch/flow'
import { loadSpotlightAnswers } from '@/lib/launch/flow-io'
import { readPendingLaunch } from '@/lib/launch/pending-io'
import { spaceChoices } from '@/lib/launch/space-choice'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { loadClock } from '@/lib/launch/clock-io'
import { getActiveLaunch } from '@/lib/launch/store'

// The launch page (VLS-07, VLS-09): one page for the whole launch. The Spotlight form first; once it is published the
// same page shows the live preview, the form to change it, and the stages still to come. Open to a signed-out visitor:
// an account is asked for at Publish (the action holds their answers and sends them to sign in). Answers held from an
// earlier try fill the form again. Dark while LAUNCH_SYSTEM_ENABLED is off.
export default async function SpotlightStepPage({ searchParams }: { searchParams: Promise<{ e?: string; new?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const { e, new: startNew } = await searchParams
  const profileId = await getMyProfileId()
  const launch = profileId ? await getActiveLaunch(profileId) : null
  const view = flowView(launch)
  const saved = view.slug ? await loadSpotlightAnswers(launch) : null
  const typed = (await readPendingLaunch())?.answers.spotlight
  const held = saved ?? (typed ? { name: typed.name ?? '', line: typed.line ?? '', link: typed.link ?? '' } : null)
  // A person with Spaces of their own is asked which one this is for, so what exists fills the page.
  const owned = profileId && !launch?.spaceId && startNew !== '1' ? await listOwnedSpaces(profileId) : []
  const choices = owned.length > 0 ? spaceChoices(owned) : undefined
  return (
    <DashboardTemplate {...flowHeading(view)} adminBar={false} width="default">
      <LaunchFlow view={view} answers={held} errorCode={typeof e === 'string' ? e : undefined} signedIn={!!profileId} choices={choices} clock={(await loadClock(launch)) ?? undefined} />
    </DashboardTemplate>
  )
}
