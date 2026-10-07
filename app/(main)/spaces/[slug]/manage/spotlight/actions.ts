'use server'

// SPACE SPOTLIGHT actions (LIVE-851). The two writes the console Spotlight editor makes: the builder's
// debounced layout save and the publish switch. Both re-resolve the Space by slug, gate FAIL-CLOSED on
// resolveSpaceManageAccess(...).canManage (a staff previewer cannot write), and write ONLY the
// `preferences.spotlight` node through nextSpotlightPreferences, which sanitizes the layout and narrows it
// to Spotlight blocks, so every other preferences key (the Space page, the website) is untouched.
//
// The Spotlight has no draft: its own publish switch is what keeps it off the network, so a save lands on
// the node the public page reads, and the cached page is revalidated. No em dashes (owner copy).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { nextSpotlightPreferences } from '@/lib/spaces/spotlight'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'

type SpotlightChange = { published?: boolean; layout?: unknown }

async function writeSpotlight(slug: string, change: SpotlightChange): Promise<{ error?: string }> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return { error: 'Space not found.' }

  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return { error: 'You do not have permission to edit this space.' }

  const current =
    space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? (space.preferences as Record<string, unknown>)
      : {}
  const preferences = nextSpotlightPreferences(current, change)

  // Untyped scoped update of the preferences jsonb (ADR-246: the column is not in the generated types).
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences }).eq('id', space.id)
  if (error) return { error: 'Could not save your Spotlight. Try again.' }

  revalidatePath(`/spaces/${space.slug}/spotlight`)
  revalidatePath(`/spaces/${space.slug}/manage/spotlight`)
  return {}
}

/** The builder's debounced save: the working layout, narrowed to a one-column Spotlight on write. */
export async function saveSpaceSpotlightLayout(slug: string, layout: BuilderLayout): Promise<{ error?: string }> {
  return writeSpotlight(slug, { layout })
}

/** The publish switch: puts the Spotlight on the network, or takes it off. The layout is kept either way. */
export async function setSpaceSpotlightPublished(slug: string, published: boolean): Promise<{ error?: string }> {
  return writeSpotlight(slug, { published: published === true })
}
