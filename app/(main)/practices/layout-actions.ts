'use server'

// Per-user Practices-page layout (no migration). A member reorders/toggles their own
// content blocks; the result lives on profiles.meta.practicesLayout as an ordered
// PageWidgetConfig[]. The write mirrors the on-air / walkthroughs profiles.meta pattern
// exactly: read the current meta, spread-merge ONLY our key, write the whole object back —
// never clobbering other meta keys (onAir, walkthroughs, tour, …). Best-effort: a failed
// save reports `fail()` but never throws.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePracticesLayout } from '@/lib/practices-page-config'
import type { PageWidgetConfig } from '@/lib/journey-plans'
import type { Database } from '@/lib/database.types'

/**
 * Persist the caller's own Practices-page layout. Own-profile only (fails if not signed
 * in). The incoming layout is normalized first (drops unknown ids, coerces flags, fills in
 * any missing defaults), then spread-merged into meta so no other meta key is touched.
 */
export async function setPracticesLayoutAction(
  layout: PageWidgetConfig[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const normalized = normalizePracticesLayout(layout)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    if (error || !data) return fail('Could not load your profile')
    const meta = ((data.meta as Record<string, unknown> | null) ?? {}) as Record<string, unknown>

    const { error: updateError } = await admin
      .from('profiles')
      // The `meta` jsonb is `Json` in the generated types; cast the payload (ADR-246), not the client.
      .update({ meta: { ...meta, practicesLayout: normalized } } as unknown as Database['public']['Tables']['profiles']['Update'])
      .eq('id', profileId)
    if (updateError) return fail('Could not save your layout')
  } catch {
    return fail('Could not save your layout')
  }

  revalidatePath('/practices')
  return ok()
}
