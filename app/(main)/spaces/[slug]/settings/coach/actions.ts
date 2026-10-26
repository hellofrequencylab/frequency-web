'use server'

import { revalidatePath } from 'next/cache'
import { writeSpaceCoachProfile } from '@/lib/spaces/private-state'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { parseSpaceCoachProfile, validateSpaceCoachProfile, type SpaceCoachProfile } from '@/lib/spaces/coach-profile'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// Authorization is resolved afresh for both save and clear. No preview or client role grants writes.
export async function saveSpaceCoachProfile(spaceId: string, value: unknown): Promise<ActionResult<SpaceCoachProfile>> {
  // Owner or direct editor only: platform staff and network admins never write or read this profile.
  const auth = await authorizeDiscoveryEditor(spaceId)
  if (!auth) return fail('Only this Space\'s owner or editors can change coach preferences.')
  const { space } = auth
  if (value !== null) {
    const error = validateSpaceCoachProfile(value)
    if (error) return fail(error)
  }
  const profile = parseSpaceCoachProfile(value)
  if (!(await writeSpaceCoachProfile(space.id, value === null ? null : profile))) {
    return fail('Your preferences could not be saved. Try again.')
  }
  revalidatePath(`/spaces/${space.slug}/settings/coach`)
  return ok(profile)
}
