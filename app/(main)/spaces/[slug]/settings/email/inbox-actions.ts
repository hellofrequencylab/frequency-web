'use server'
import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { requireSpaceEmailIdentityOwner } from '@/lib/spaces/email-identity-registry'
import { provisionSpaceInboxAddress, checkSpaceInboxAddress, type SpaceInboxResult } from '@/lib/comms/space-inbox-address'

// EMAIL-022: the one button on the "Your Space address" card. Owner only (any plan: the Space address
// is for every account). The module never throws; a refused result carries its own member-safe sentence.
type Outcome = Extract<SpaceInboxResult, { ok: true }>
/** The owner gate, in the shape identity-actions.ts uses: throws for anyone but the Space owner. */
async function assertOwner(spaceId: string) { return requireSpaceEmailIdentityOwner(spaceId, false) }
function finish(slug: string, result: SpaceInboxResult): ActionResult<Outcome> {
  revalidatePath(`/spaces/${slug}/settings/email`)
  return result.ok ? ok(result) : fail(result.message)
}
function refused(err: unknown): ActionResult<Outcome> {
  return fail(err instanceof Error ? err.message : 'Only the Space owner can set up the Space address.')
}
export async function setUpSpaceInboxAddress(spaceId: string, slug: string): Promise<ActionResult<Outcome>> {
  try { await assertOwner(spaceId) } catch (err) { return refused(err) }
  return finish(slug, await provisionSpaceInboxAddress(spaceId, { restartFailureWindow: true }))
}
export async function checkSpaceInboxAddressAction(spaceId: string, slug: string): Promise<ActionResult<Outcome>> {
  try { await assertOwner(spaceId) } catch (err) { return refused(err) }
  return finish(slug, await checkSpaceInboxAddress(spaceId))
}
