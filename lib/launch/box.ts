// THE LAUNCH BOX LOADER (VLS-08). One read for the members shell: the box for the signed-in member's running
// launch, or null. Null when the launch is switched off, when nobody is signed in, when there is no launch
// and on any failure: the box is a convenience, so a failed read never costs the page. Server-only.

import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from './enabled'
import { boxView, type LaunchBoxView } from './box-state'
import { getActiveLaunch } from './store'

export async function loadLaunchBox(): Promise<LaunchBoxView | null> {
  if (!launchSystemEnabled()) return null
  try {
    const profileId = await getMyProfileId()
    if (!profileId) return null
    const launch = await getActiveLaunch(profileId)
    return launch ? boxView(launch, new Date()) : null
  } catch {
    return null
  }
}
