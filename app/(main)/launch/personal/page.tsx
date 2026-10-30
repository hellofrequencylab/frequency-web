import { notFound, redirect } from 'next/navigation'
import { LaunchPersonal } from '@/components/launch/launch-personal'
import { DashboardTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { inFlowHref } from '@/lib/launch/destination'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { loadKnownProfile } from '@/lib/launch/known-io'
import { prefillAnswers } from '@/lib/launch/known'
import { personalSpotlightHref } from '@/lib/launch/personal'
import { loadStoredProfile } from '@/lib/launch/personal-io'
import { launchStepHref } from '@/lib/launch/steps'

// The personal Spotlight step (LIVE-1918): the "just my Spotlight" way through the launch. A name, one line and a link,
// filled from the profile, saved back to it, with the real page beside the form; then the offer of a Space. It needs an
// account because the Spotlight is the profile. Dark while LAUNCH_SYSTEM_ENABLED is off.
export default async function PersonalSpotlightStepPage({ searchParams }: { searchParams: Promise<{ e?: string; saved?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/personal')
  const { e, saved } = await searchParams
  const [known, stored] = await Promise.all([loadKnownProfile(profileId), loadStoredProfile(profileId)])
  const answers = prefillAnswers(null, null, known)
  return (
    <DashboardTemplate title="Your Spotlight" description="Your own page, free. Make it sound like you." adminBar={false} width="default">
      <LaunchPersonal
        answers={answers}
        errorCode={typeof e === 'string' ? e : undefined}
        spotlightHref={personalSpotlightHref(stored?.handle)}
        saved={saved === '1'}
        spaceHref={inFlowHref(launchStepHref('spotlight'))}
      />
    </DashboardTemplate>
  )
}
