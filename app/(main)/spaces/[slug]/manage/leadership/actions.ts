'use server'

// THE LEADERSHIP PAGE'S ONE WRITE (LIVE-862): save the executive overview. Re-resolves the Space by slug
// and gates FAIL-CLOSED on resolveSpaceManageAccess(...).canManage, exactly as every console action does
// (a staff previewer cannot write). Writes ONLY `space_private_state.program_overview` (SCAN-827), so
// the anon-readable spaces.preferences row never carries it. nextProgramOverviewPreferences still
// validates length and normalises the Markdown.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { nextProgramOverviewPreferences, PROGRAM_OVERVIEW_KEY } from '@/lib/spaces/leadership'
import { refreshSite } from '@/lib/sites/site-cache'

export async function saveProgramOverview(slug: string, markdown: string): Promise<{ error?: string }> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return { error: 'Space not found.' }
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return { error: 'You do not have permission to edit this space.' }

  const next = nextProgramOverviewPreferences({}, markdown)
  if ('error' in next) return next
  const text = typeof next.preferences[PROGRAM_OVERVIEW_KEY] === 'string' ? next.preferences[PROGRAM_OVERVIEW_KEY] : null

  const { error } = await createAdminClient().from('space_private_state').upsert(
    { space_id: space.id, program_overview: text, updated_at: new Date().toISOString() },
    { onConflict: 'space_id' },
  )
  if (error) return { error: 'Could not save the overview. Try again.' }

  revalidatePath(`/spaces/${space.slug}/manage/leadership`)
  refreshSite(space.slug)
  return {}
}
