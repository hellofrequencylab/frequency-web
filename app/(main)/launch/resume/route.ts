import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { resumeView } from '@/lib/launch/resume'
import { getLaunchForOwner } from '@/lib/launch/store'

// /launch/resume?lid=<launch id> (VLS-10): the link the launch box and the reminder emails carry. The owner lands
// on the step they stopped at; a stopped or finished launch lands on the welcome-back page, which says so.
// A launch that is not theirs is a 404: the owner policy returns no row, so the page cannot tell a stranger's
// launch from one that does not exist. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET(request: Request) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const lid = new URL(request.url).searchParams.get('lid') ?? undefined
  const launch = await getLaunchForOwner(profileId, lid)
  if (!launch) notFound()
  const view = resumeView(launch, new Date())
  redirect(view.kind === 'step' ? view.href : '/launch')
}
