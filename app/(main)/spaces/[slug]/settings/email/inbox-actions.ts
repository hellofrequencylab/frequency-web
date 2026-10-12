'use server'
import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { requireSpaceEmailIdentityOwner } from '@/lib/spaces/email-identity-registry'
import { provisionSpaceInboxAddress, checkSpaceInboxAddress, type SpaceInboxResult } from '@/lib/comms/space-inbox-address'

// EMAIL-022: the one button on the "Your Space address" card. Owner only (any plan: the Space address
// is for every account). The module never throws; a refused result carries its own member-safe sentence.
type Outcome = Extract<SpaceInboxResult, { ok: true }>
async function run(spaceId: string, slug: string, task: () => Promise<SpaceInboxResult>): Promise<ActionResult<Outcome>> {
  try {
    await requireSpaceEmailIdentityOwner(spaceId, false)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Only the Space owner can set up the Space address.')
  }
  const result = await task()
  revalidatePath(`/spaces/${slug}/settings/email`)
  return result.ok ? ok(result) : fail(result.message)
}
export async function setUpSpaceInboxAddress(spaceId: string, slug: string) {
  return run(spaceId, slug, () => provisionSpaceInboxAddress(spaceId))
}
export async function checkSpaceInboxAddressAction(spaceId: string, slug: string) {
  return run(spaceId, slug, () => checkSpaceInboxAddress(spaceId))
}
