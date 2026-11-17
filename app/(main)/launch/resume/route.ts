import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { launchHomeHref, launchResumeSignInHref } from '@/lib/launch/destination'
import { getLaunchForOwner } from '@/lib/launch/store'

// /launch/resume?lid=<launch id> (VLS-10): the link the launch box and the reminder emails carry. The owner lands
// on /launch, which names the step they stopped at (or says the launch is stopped or finished).
// A launch that is not theirs is a 404: the owner policy returns no row, so the page cannot tell a stranger's
// launch from one that does not exist. Dark while LAUNCH_SYSTEM_ENABLED is off.
// Signed out (an expired session opening a come-back email, LIVE-2330), it goes to sign-in with `next` set back to
// this same link, so the owner returns to their own launch. proxy.ts leaves this path alone (it is neither a Create a
// Space door nor protected), and a route handler never runs the (main) layout.
export async function GET(request: Request) {
  if (!launchSystemEnabled()) notFound()
  const lid = new URL(request.url).searchParams.get('lid') ?? undefined
  const profileId = await getMyProfileId()
  if (!profileId) redirect(launchResumeSignInHref(lid))
  const launch = await getLaunchForOwner(profileId, lid)
  if (!launch) notFound()
  redirect(launchHomeHref({ signedIn: true, lid: launch.id }))
}
