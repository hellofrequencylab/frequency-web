'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { setPlatformFlag } from '@/lib/platform-flags'
import { parseInput, z } from '@/lib/validation'
import { RENDER_PATH_SURFACES, renderPathKey } from '@/lib/render-path'

/** Flip one surface onto (or back off) the node render path. Staff admin+; audited in platform_flag_events.
 *  The surface is checked against the fixed list, so the key written is never caller-supplied text. */
export async function setRenderPath(surface: string, enabled: boolean): Promise<ActionResult> {
  const { profileId } = await requireAdmin('admin')
  let parsed: { surface: (typeof RENDER_PATH_SURFACES)[number]; enabled: boolean }
  try {
    parsed = parseInput(z.object({ surface: z.enum(RENDER_PATH_SURFACES), enabled: z.boolean() }), { surface, enabled })
  } catch {
    return fail('That is not a render path.')
  }
  try {
    await setPlatformFlag(renderPathKey(parsed.surface), parsed.enabled, {
      changedBy: profileId,
      source: 'admin',
    })
  } catch {
    return fail('Could not save that switch.')
  }
  revalidatePath('/admin/page-layout')
  return ok()
}
