// THE STEP SCREEN LOADER (SCAN-1211), the IO half. One read for all seven step routes: the switch, the signed-in owner, their
// own launch and its Space, then the words and the one destination. Read under the person's own session, so a screen only ever
// shows their own launch. Server-only.

import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { launchSystemEnabled } from './enabled'
import { stepDestination, stepScreen, type ScreenStepId, type StepScreenCopy } from './step-screens'
import { launchStepHref } from './steps'
import { getActiveLaunch } from './store'

export interface StepScreenData extends StepScreenCopy {
  href: string
  /** The step already made its thing. The screen says so and still offers the door. */
  done: boolean
  /** No Space yet: the button starts at the Spotlight, which makes it. */
  needsSpace: boolean
}

/** Dark while LAUNCH_SYSTEM_ENABLED is off; signed out goes to sign in; no launch goes to /launch. */
export async function loadStepScreen(id: ScreenStepId): Promise<StepScreenData> {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=${launchStepHref(id)}`)
  const launch = await getActiveLaunch(profileId)
  if (!launch) redirect('/launch')
  const space = launch.spaceId ? await getSpaceById(launch.spaceId) : null
  return {
    ...stepScreen(id),
    href: stepDestination(id, space ? { id: space.id, slug: space.slug } : null),
    done: launch.steps[id]?.status === 'published',
    needsSpace: !space,
  }
}
