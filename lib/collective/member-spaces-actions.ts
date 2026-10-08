'use server'

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'

/** The database re-checks both owners and capacity under a parent lock. Never trust a client count. */
export async function setCollectiveMemberSpace(parentId: string, childId: string, attach: boolean): Promise<ActionResult> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in to manage your member Spaces.')
  const parent = await getSpaceById(parentId)
  if (!parent || parent.ownerProfileId !== caller.id || !spaceFunctionAccess(parent, 'billing', 'admin')) {
    return fail('You must own this Collective to manage its member Spaces.')
  }
  const { error } = await createAdminClient().rpc('set_collective_member_space' as never,
    { p_parent_id: parentId, p_child_id: childId, p_owner_id: caller.id, p_attach: attach } as never)
  if (error) {
    if (error.message.includes('collective_full')) return fail('Your Collective is full. Add another Space to your plan before attaching one.')
    return fail('Could not update this member Space. Check that you own both Spaces and try again.')
  }
  revalidatePath('/spaces', 'layout')
  return ok()
}


export async function setCollectiveExtraSpaces(parentId: string, target: number, priceId: string, unitCents: number): Promise<ActionResult> {
  const { updateExtraCollectiveSpaces } = await import('./extra-space-billing')
  const result = await updateExtraCollectiveSpaces(parentId, target, priceId, unitCents)
  if (!('error' in result)) revalidatePath('/spaces', 'layout')
  return result
}
