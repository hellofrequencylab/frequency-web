'use server'

import type { Data } from '@/lib/page-editor/types'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isRenderableSpaceDoc } from '@/lib/page-editor/templates/space'
import { withPageDoc, withoutPageDoc, hasPage, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE PAGE editor actions (multi-page model). The operator edits a SPECIFIC profile page
// through Puck and PUBLISHES its doc to spaces.preferences.pageDocs[pageSlug] (the additive
// ADR-461 store; NO migration). `pageSlug` defaults to Home, so an existing single-page Space
// edits + publishes exactly as before, now via pageDocs.home. EVERY action RE-RESOLVES the space
// from the slug and RE-GATES caps.canEditProfile server-side, so a non-editor can never write
// another space's page (the route gate is UX; this is the authority). Staff preview (a janitor
// who is not an editor) is read-only: it has no canEditProfile, so every write fails closed.
//
// NON-DESTRUCTIVE: writing only REPLACES the one page's doc under `pageDocs`, preserving every
// other key (the other pages' docs, mode overrides, cover size) via the pure `withPageDoc`
// mutator. A reset drops just that page's doc (withoutPageDoc); the resolver then falls back to
// the universal default page. No other data is touched.

/** The public path a page renders at: Home at the profile index, a custom page under its slug. */
function pagePath(slug: string, pageSlug: string): string {
  return pageSlug === HOME_SLUG ? `/spaces/${slug}` : `/spaces/${slug}/${pageSlug}`
}

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
 * Publish a Space PAGE's Puck document to spaces.preferences.pageDocs[pageSlug] (default Home).
 * The doc is VALIDATED against the current Puck config (isRenderableSpaceDoc) before it is trusted,
 * so a malformed or stale-block payload is rejected rather than stored, and the target page must
 * EXIST in the nav (hasPage) so a doc can never be written for a page the operator never created.
 * NON-DESTRUCTIVE: only that page's doc is replaced; every other page + preferences key is
 * preserved. Owner/admin/editor-gated. Returns ActionResult.
 */
export async function publishSpaceLanding(
  slug: string,
  data: Data,
  pageSlug: string = HOME_SLUG,
): Promise<ActionResult> {
  if (!isRenderableSpaceDoc(data)) return fail('That layout could not be saved. Try again.')

  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')
  if (!hasPage(auth.preferences, pageSlug)) return fail('That page no longer exists.')

  const preferences = withPageDoc(auth.preferences, pageSlug, data)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not publish your changes. Try again.')
  }

  revalidatePath(pagePath(slug, pageSlug))
  revalidatePath(`/spaces/${slug}/edit-page`)
  return ok()
}

/**
 * Reset a Space PAGE back to the universal default by dropping its stored doc (default Home).
 * Removes only that page's doc under `pageDocs` (and, for Home, the legacy single doc), so the
 * resolver falls back to the default page. Owner/admin/editor-gated. Returns ActionResult.
 */
export async function resetSpaceLanding(
  slug: string,
  pageSlug: string = HOME_SLUG,
): Promise<ActionResult> {
  const auth = await authorizeEditor(slug)
  if (!auth) return fail('You do not have access to edit this page.')

  const preferences = withoutPageDoc(auth.preferences, pageSlug)
  if (!(await writePreferences(auth.spaceId, preferences))) {
    return fail('Could not reset the page. Try again.')
  }

  revalidatePath(pagePath(slug, pageSlug))
  revalidatePath(`/spaces/${slug}/edit-page`)
  return ok()
}
