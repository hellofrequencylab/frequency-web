'use server'

// The shared Elements console actions (docs/EMBEDDABLE-ELEMENTS.md). Save the PLATFORM MASTER config
// (settings + per-feature role gates) for a registered element. Staff-gated; the master applies
// site-wide (every occurrence of the element reads it). Per-space overrides use the same store from a
// space surface (not this console).

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { elementDef } from '@/lib/elements/registry'
import { writeElementSettings } from '@/lib/elements/store'
import type { StoredElementConfig } from '@/lib/elements/config'

/** Save one element's platform-master settings + role gates. Staff only. writeElementSettings
 *  normalizes the config against the element's known feature keys (drops anything else). */
export async function saveElementSettings(
  elementKey: string,
  config: StoredElementConfig,
): Promise<ActionResult> {
  const { profileId } = await requireAdmin('admin')
  if (!elementDef(elementKey)) return fail('Unknown element.')
  const res = await writeElementSettings(elementKey, null, config, profileId)
  if (res.error) return fail(res.error)
  revalidatePath('/admin/elements')
  return ok()
}
