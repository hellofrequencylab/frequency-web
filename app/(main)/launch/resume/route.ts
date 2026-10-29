import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { launchHomeHref } from '@/lib/launch/destination'
import { getLaunchForOwner } from '@/lib/launch/store'

// /launch/resume?lid=<launch id> (VLS-10): the link the launch box and the reminder emails carry. The owner lands
// on /launch, which names the step they stopped at (or says the launch is stopped or finished).
// A launch that is not theirs is a 404: the owner policy returns no row, so the page cannot tell a stranger's
// launch from one that does not exist. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET(request: Request) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const lid = new URL(request.url).searchParams.get('lid') ?? undefined
  const launch = await getLaunchForOwner(profileId, lid)
  if (!launch) notFound()
  redirect(launchHomeHref({ signedIn: true, lid: launch.id }))
}
