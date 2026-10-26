'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { writeSpaceCoachProfile } from '@/lib/spaces/private-state'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { parseSpaceCoachProfile, validateSpaceCoachProfile, type SpaceCoachProfile } from '@/lib/spaces/coach-profile'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// Authorization is resolved afresh for both save and clear. No preview or client role grants writes.
export async function saveSpaceCoachProfile(spaceId: string, value: unknown): Promise<ActionResult<SpaceCoachProfile>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to change your coach preferences.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return fail('You do not have permission to edit this Space.')
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
