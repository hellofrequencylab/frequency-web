'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isSpaceTemplate, type SpaceTemplate } from '@/lib/spaces/templates'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { nextLayoutPreferences, nextCoverSizePreferences, type CoverSize } from './preferences'

// SPACE LAYOUT actions (ADR-472, the public-page layout layer). An operator picks the STARTING layout
// their Space's public landing renders through (one of the four templates Book · Schedule · Storefront ·
// Hub, or 'auto' to derive it from the type + Focus) from /spaces/<slug>/manage/layout. EVERY action
// RE-RESOLVES the space from the slug and RE-GATES caps.canEditProfile server-side, so a non-editor can
// never rewrite another space's layout (the route gate is UX; this is the authority). Staff preview (a
// janitor who is not an editor) is read-only: it has no canEditProfile, so every write below fails closed.
//
// SEMANTICS (important):
//   • preferences.template = the operator's CHOSEN starting layout (overrides the auto-derived one).
//     'auto' clears the override so the layout derives from the Space's type + Focus again.
//   • preferences.puck = the CUSTOMIZED doc; it WINS over any preset. So setting `template` alone does
//     NOT visibly change a customized space's landing — the reset path (opts.reset) also clears `puck`
//     so the new layout's preset actually shows.
//
// NON-DESTRUCTIVE by default: setting the template only writes the `template` node of preferences,
// preserving every other key (the puck doc, the mode overrides). A `reset` additionally clears the one
// `puck` node (the resolver then falls back to the new template's preset). Modelled on the edit-page
// publish/reset actions; deliberately NOT coupled to that file. No em dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s space; returns the resolved
 *  space id + its current preferences blob, or null on any miss. Mirrors edit-page/actions.ts's shape
 *  intentionally (kept local so this file is self-contained, not coupled to the editor actions). */
async function authorizeEditor(slug: string): Promise<{
  spaceId: string
  preferences: Record<string, unknown>
} | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return null // owner / admin / editor (the write authority)
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return { spaceId: space.id, preferences: asRecord(space.preferences) }
}

/** Untyped scoped update of the space's preferences column (ADR-246), bound to the id. */
async function writePreferences(
  spaceId: string,
  preferences: Record<string, unknown>,
): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences }).eq('id', spaceId)
  return !error
}

/**
 * Set the Space's public-page STARTING layout. `template` is one of the four template ids, or 'auto' to
 * clear the override and derive the layout from the Space's type + Focus. NON-DESTRUCTIVE by default:
 * only the `template` node is written; the customized `puck` doc + mode overrides are preserved. Pass
 * `opts.reset` to ALSO clear the customized `puck` doc, so the new layout's preset renders instead of the
 * saved page (the caller confirms this replaces the customized page). Owner/admin/editor-gated. Returns
 * ActionResult.
 */
export async function setSpaceLayoutTemplate(
  slug: string,
  template: SpaceTemplate | 'auto',
  opts?: { reset?: boolean },
): Promise<ActionResult> {
  if (template !== 'auto' && !isSpaceTemplate(template)) return fail('Pick a layout from the list.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextLayoutPreferences(auth.preferences, template, opts)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the layout. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}

/**
 * Set the public Space header's COVER SIZE: 'header' (a compact identity band) or 'hero' (a tall,
 * immersive cover). Read by the profile layout off preferences.coverSize. NON-DESTRUCTIVE: only the
 * `coverSize` node is written, every other preferences key preserved. Owner/admin/editor-gated
 * (staff preview fails closed). Returns ActionResult.
 */
export async function setSpaceCoverSize(slug: string, size: CoverSize): Promise<ActionResult> {
  if (size !== 'header' && size !== 'hero') return fail('Pick a cover size.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const next = nextCoverSizePreferences(auth.preferences, size)
  if (!(await writePreferences(auth.spaceId, next))) {
    return fail('Could not update the cover size. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/manage/layout`)
  return ok()
}
