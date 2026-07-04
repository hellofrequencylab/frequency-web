'use server'

// SPACE PROFILE LAYOUT action (Epic 1.7, S3 block-picker editor). The one server action the profile
// layout editor (/spaces/<slug>/settings/profile) calls to persist the operator's block-picker edits:
// the ordered list of profile sections + which are hidden. The SERVER is the authority:
//   1. Resolve the Space by id and the caller (getCallerProfile).
//   2. Gate on resolveSpaceManageAccess(...).canManage — FAIL-CLOSED. A staff janitor's read-only
//      preview (staffViewing) is NOT canManage, so the write is refused for everyone but an editor+.
//   3. VALIDATE the client layout down to known ProfileBlockIds only (never trust the wire).
//   4. Merge into spaces.preferences.profileLayout through the untyped admin client (ADR-246: the
//      `preferences` jsonb column is not in the generated types), preserving every other preferences
//      key, then revalidate the profile + its staff preview so the saved order shows immediately.
//
// The saved blob is fail-safe on READ (lib/spaces/profile-layout.ts parseSavedProfileLayout), so a
// partial / stale write never breaks a render; this action keeps it clean on WRITE. No em dashes
// (owner copy, CONTENT-VOICE).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById, getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { profileBlockById, type ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { sanitizeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'

/** Keep only valid, de-duplicated ProfileBlockIds from an unknown array (defense in depth on the wire). */
function sanitizeIds(value: unknown): ProfileBlockId[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<ProfileBlockId>()
  const out: ProfileBlockId[] = []
  for (const v of value) {
    if (typeof v !== 'string' || profileBlockById(v) === null) continue
    const id = v as ProfileBlockId
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Untyped scoped update of the space's preferences jsonb (ADR-246), bound to the resolved id. */
async function updateSpacePreferences(spaceId: string, preferences: Record<string, unknown>): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ preferences }).eq('id', spaceId)
  return !error
}

/**
 * Persist the block-picker layout for a Space. Owner/admin/editor-gated server-side via
 * resolveSpaceManageAccess (fail-closed: a staff preview cannot write). Accepts BOTH shapes at the same
 * spaces.preferences.profileLayout node:
 *   • the S3 FLAT shape ({order,hidden}) — sanitized to known ProfileBlockIds (the S3 vertical editor);
 *   • the U2b GRID shape ({template,slots,hidden}) — sanitized to unified space block ids (the grid
 *     editor). A grid write never emits `order`, so the S3 read path falls back to its fresh default and
 *     nothing the S3 preview renders is disturbed.
 * The chosen node fully replaces preferences.profileLayout, preserving every OTHER preferences key. An
 * empty layout clears the node (back to the fresh default). Returns ActionResult; on success revalidates
 * the profile + preview.
 */
export async function saveSpaceProfileLayout(
  spaceId: string,
  layout: EntityLayout,
): Promise<ActionResult> {
  const caller = await getCallerProfile()

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // FAIL-CLOSED: only a manager (owner / admin / editor) may write. staffViewing (a janitor's read-only
  // preview) is deliberately NOT accepted, so the preview never confers a save.
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return fail('You do not have permission to edit this space.')

  // Never trust the wire. A grid write (freeform ROWS from the in-rail builder, ADR-516 Phase D, or the
  // legacy template / slots) sanitizes to unified space ids; a flat S3 write sanitizes to ProfileBlockIds.
  // `node` is the value stored at preferences.profileLayout, or null to clear it.
  let node: Record<string, unknown> | null
  if (layout && (layout.rows || layout.template || layout.slots)) {
    node = sanitizeEntityLayout(layout, 'space') as Record<string, unknown> | null
  } else {
    const order = sanitizeIds(layout?.order)
    const hidden = sanitizeIds(layout?.hidden)
    const flat: Record<string, unknown> = {}
    if (order.length) flat.order = order
    if (hidden.length) flat.hidden = hidden
    node = Object.keys(flat).length ? flat : null
  }

  // Merge into the existing preferences blob, preserving every other key.
  const current =
    space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? { ...(space.preferences as Record<string, unknown>) }
      : {}
  if (node) current.profileLayout = node
  else delete current.profileLayout

  if (!(await updateSpacePreferences(space.id, current))) {
    return fail('Could not save your layout. Try again.')
  }

  revalidatePath(`/spaces/${space.slug}/settings/profile`)
  // The in-rail builder lives on the profile ROOT (ADR-516 Phase D), so revalidate THERE so the
  // server-rendered layout reconciles on the next visit (the live preview already repaints from context
  // during the session — no round-trip).
  revalidatePath(`/spaces/${space.slug}`)
  revalidatePath(`/spaces/${space.slug}/profile-preview`)
  return ok()
}

/**
 * Slug-keyed grid save for the in-rail Space page builder (ADR-516 Phase D). The shared EntityLayoutStore
 * mounts on the Space profile ROOT (which knows the slug, not the DB id), so this thin wrapper resolves the
 * Space by slug and delegates to saveSpaceProfileLayout, which OWNER-gates (resolveSpaceManageAccess) and
 * SANITIZES the rows server-side. Returns the `{ error? }` shape the store's debounced flush expects.
 */
export async function saveSpaceGridLayout(
  slug: string,
  layout: BuilderLayout,
): Promise<{ error?: string }> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return { error: 'Space not found.' }
  const res = await saveSpaceProfileLayout(space.id, layout as EntityLayout)
  return isError(res) ? { error: res.error } : {}
}
