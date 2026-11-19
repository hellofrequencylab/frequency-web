// THE LAUNCH TAKES THE SPACE THAT ALREADY EXISTS (LIVE-2392, the write half). A launch row with no Space attached reads
// as "nothing made yet", even for an owner whose Space, Spotlight and website are all up: the checklist then sits on
// step one for good. When the rule in lib/launch/space-choice.ts names the person's one Space, attach it (the same two
// writes the "Which Space is this for?" button makes, lib/launch/actions.ts) and hand back the launch as it now is.
// Runs under the member's own session, once per launch: after it the row carries the Space. Never throws.

import { recordLaunchEvent } from './events'
import { adoptableSpace } from './space-choice'
import { listOwnedSpaces } from './spaces-io'
import type { LaunchSnapshot } from './state'
import { attachSpace, markStepPublished } from './store'

export async function withOwnedSpace(launch: LaunchSnapshot, profileId: string): Promise<LaunchSnapshot> {
  if (launch.spaceId || launch.ownerId !== profileId) return launch
  try {
    const space = adoptableSpace(launch, await listOwnedSpaces(profileId))
    if (!space || !(await attachSpace(launch, space.id))) return launch
    const attached = { ...launch, spaceId: space.id }
    if (!space.spotlightLive || launch.steps.spotlight?.status === 'published') return attached
    const marked = await markStepPublished(attached, 'spotlight', space.slug)
    if (marked) await recordLaunchEvent(profileId, { type: 'step_published', launchId: launch.id, step: 'spotlight' })
    return marked ? { ...marked, spaceId: space.id } : attached
  } catch {
    return launch
  }
}
