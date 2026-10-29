// THE LAUNCH BOX LOADER (VLS-08). One read for the members shell: the box for the signed-in member's running
// launch, or null. Null when the launch is switched off, when nobody is signed in, when there is no launch
// and on any failure: the box is a convenience, so a failed read never costs the page. Server-only.

import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from './enabled'
import { boxView, type LaunchBoxView } from './box-state'
import { loadPostPublishList } from './get-started-io'
import { setupBoxView } from './setup-box'
import { loadSetupHidden } from './setup-hidden-io'
import { getActiveLaunch, getLaunchForOwner } from './store'

export async function loadLaunchBox(): Promise<LaunchBoxView | null> {
  if (!launchSystemEnabled()) return null
  try {
    const profileId = await getMyProfileId()
    if (!profileId) return null
    const active = await getActiveLaunch(profileId)
    // Once the Spotlight is published the same pill stays as "Finish setup" over the Get Started list (lib/launch/setup-box.ts)
    // until every item is done, even after the launch overview itself has completed; the pill never disappears on Publish,
    // it changes what it counts. Hiding it (lib/launch/setup-hidden.ts) is the person's choice.
    const list = await loadPostPublishList(profileId)
    if (list) {
      if (await loadSetupHidden(profileId)) return null
      const launch = active ?? (await getLaunchForOwner(profileId))
      return launch ? setupBoxView(launch, list, new Date()) : null
    }
    if (!active) return null
    return boxView(active, new Date())
  } catch {
    return null
  }
}

// A running launch owns the member's "what next" list (VLS-11): the Get Started checklist stands down while the box is
// up, so the person never sees two lists. Without a launch (or with the launch switched off) the checklist is untouched.
// Once the Spotlight is published the list is the launch overview's own to-do (lib/launch/get-started-io.ts), so the
// box stands aside there too and the rail draws that one list.
export async function launchOwnsNextSteps(): Promise<boolean> {
  if ((await loadLaunchBox()) === null) return false
  const profileId = await getMyProfileId()
  return !(profileId && (await loadPostPublishList(profileId)))
}
