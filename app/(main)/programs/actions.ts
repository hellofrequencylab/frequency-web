'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { markProgramComplete } from '@/lib/programs'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function markProgramCompleteAction(
  slug: string,
): Promise<ActionResult<{ newlyCompleted: boolean }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const res = await markProgramComplete(profileId, slug)
  revalidatePath('/programs')
  revalidatePath(`/programs/${slug}`)
  return ok(res)
}
