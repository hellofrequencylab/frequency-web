'use server'

// THE LEADERSHIP PAGE'S ONE WRITE (LIVE-862): save the executive overview. Re-resolves the Space by slug
// and gates FAIL-CLOSED on resolveSpaceManageAccess(...).canManage, exactly as every console action does
// (a staff previewer cannot write). Writes ONLY `preferences.programOverview` through
// nextProgramOverviewPreferences, so every other preferences key is untouched. The website never shows
// the overview, but its cached Space row carries preferences, so the save expires it like every other
// preferences write (refreshSite).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { nextProgramOverviewPreferences } from '@/lib/spaces/leadership'
import { refreshSite } from '@/lib/sites/site-cache'

export async function saveProgramOverview(slug: string, markdown: string): Promise<{ error?: string }> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return { error: 'Space not found.' }
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return { error: 'You do not have permission to edit this space.' }

  const next = nextProgramOverviewPreferences(space.preferences, markdown)
  if ('error' in next) return next

  // Untyped scoped update of the preferences jsonb (ADR-246: the column is not in the generated types).
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences: next.preferences }).eq('id', space.id)
  if (error) return { error: 'Could not save the overview. Try again.' }

  revalidatePath(`/spaces/${space.slug}/manage/leadership`)
  refreshSite(space.slug)
  return {}
}
