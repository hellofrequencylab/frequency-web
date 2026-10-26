'use server'

import { revalidatePath } from 'next/cache'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { writeSpaceCoachProfile } from '@/lib/spaces/private-state'
import { parseSpaceCoachProfile, validateSpaceCoachProfile, type SpaceCoachProfile } from '@/lib/spaces/coach-profile'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// Authorization is resolved afresh for both save and clear. No preview or client role grants writes.
export async function saveSpaceCoachProfile(spaceId: string, value: unknown): Promise<ActionResult<SpaceCoachProfile>> {
  // Private coaching does not inherit platform staff or Network content-management authority.
  const editor = await authorizeDiscoveryEditor(spaceId)
  if (!editor) return fail('You do not have permission to edit coach preferences for this Space.')
  const { space } = editor
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
