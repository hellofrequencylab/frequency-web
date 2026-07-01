'use server'

import type { Data } from '@measured/puck'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isRenderableSpaceDoc } from '@/lib/page-editor/templates/space'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE LANDING editor actions (ADR-476/472, Phase 1). The operator edits their
// Space's public LANDING through Puck and PUBLISHES the doc to spaces.preferences.puck
// (the additive ADR-461 store; NO migration). EVERY action RE-RESOLVES the space from
// the slug and RE-GATES caps.canEditProfile server-side, so a non-editor can never
// write another space's landing (the route gate is UX; this is the authority). Staff
// preview (a janitor who is not an editor) is read-only: it has no canEditProfile, so
// every write below fails closed for them.
//
// NON-DESTRUCTIVE: writing only REPLACES the `puck` node of preferences, preserving
// every other key (mode overrides, template override) already in the blob, exactly
// like the Mode settings actions. Clearing reverts the landing to the generated
// preset (the resolver falls back when no stored doc is present). No data is deleted
// beyond the one `puck` node on a reset.

/** Authorize the caller as an EDITOR (owner / admin / editor) of `slug`'s space;
 *  returns the resolved space id + its current preferences blob, or null on any miss. */
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
 * Publish the Space's LANDING Puck document to spaces.preferences.puck. The doc is
 * VALIDATED against the current Puck config (isRenderableSpaceDoc) before it is
 * trusted, so a malformed or stale-block payload is rejected rather than stored.
 * NON-DESTRUCTIVE: only the `puck` node is replaced; every other preferences key is
 * preserved. Owner/admin/editor-gated. Returns ActionResult.
 */
export async function publishSpaceLanding(slug: string, data: Data): Promise<ActionResult> {
  if (!isRenderableSpaceDoc(data)) return fail('That layout could not be saved. Try again.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const preferences = { ...auth.preferences, puck: data }
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not publish your changes. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
  return ok()
}

/**
 * Reset the Space's LANDING back to the generated preset by clearing the stored doc.
 * Removes only the `puck` node from preferences (the resolver then falls back to the
 * template preset). Owner/admin/editor-gated. Returns ActionResult.
 */
export async function resetSpaceLanding(slug: string): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const preferences = { ...auth.preferences }
  delete preferences.puck
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not reset the page. Try again.')
  }

  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/edit-page`)
  return ok()
}
