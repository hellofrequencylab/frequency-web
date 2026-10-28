import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { clearPendingLaunch, readPendingLaunch } from '@/lib/launch/pending-io'
import { startLaunch } from '@/lib/launch/store'

// /launch/claim (VLS-06): where a visitor lands after signing in with a launch held in their cookie. It makes their
// one space_launch row from the held niche and intents, clears the hold so it is claimed once, and sends them on
// to wherever they stopped. startLaunch hands back the launch already running, so a second tap, a second tab or a
// return visit never makes a second row. With no hold the route just resumes. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET() {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/claim')
  const held = await readPendingLaunch()
  if (held) {
    const launch = await startLaunch(profileId, { niche: held.niche, intents: held.intents })
    if (launch) await clearPendingLaunch()
  }
  redirect('/launch/resume')
}
