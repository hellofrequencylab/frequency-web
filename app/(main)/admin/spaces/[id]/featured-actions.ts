'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { patchSpacePreferences } from '@/lib/spaces/store'
import { parseInput, z, uuid } from '@/lib/validation'

// THE FEATURED SWITCH for the Business Spaces directory (LIVE-1018), behind the "Directory" section on
// /admin/spaces/[id]. Janitor-gated and audited (`space.directory_featured`). It writes ONE key,
// `preferences.directoryFeatured`, through the key-scoped writer, so an editor autosave landing at the
// same moment is never reverted (SCAN-833). Turning it off deletes the key. No em dashes (operator copy).

export async function setSpaceDirectoryFeaturedAction(spaceId: string, featured: boolean): Promise<ActionResult> {
  const { profileId } = await requireAdmin('janitor')
  let parsed: { spaceId: string; featured: boolean }
  try {
    parsed = parseInput(z.object({ spaceId: uuid, featured: z.boolean() }), { spaceId, featured })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'That request was not valid.')
  }
  const written = await patchSpacePreferences(parsed.spaceId, { directoryFeatured: parsed.featured ? true : null })
  if (!written) return fail('The switch did not save. Try again, and check the Space still exists.')
  await logAdminAction({
    actorId: profileId,
    action: 'space.directory_featured',
    targetType: 'space',
    targetId: parsed.spaceId,
    detail: { featured: parsed.featured },
  })
  revalidatePath(`/admin/spaces/${parsed.spaceId}`)
  revalidatePath('/spaces/directory')
  revalidatePath('/discover/spaces')
  return ok()
}
