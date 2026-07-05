'use server'

// The Module Manager's menu-override write (ADR-546, docs/MODULAR-MENU.md — P3). One guarded server action
// persists the owner's menu presentation overrides — the module ORDER and the HIDDEN set — into
// spaces.preferences.moduleMenu, mirroring saveSpaceGridLayout (settings/profile/actions.ts) exactly:
//   1. Resolve the Space by slug and the caller (getCallerProfile).
//   2. Gate on getSpaceCapabilities(...).canManageMembers — OWNER / ADMIN only. A mere editor or a staff
//      previewer cannot reshape the menu (FAIL-CLOSED), matching setSpaceFeatureEnabled's authority.
//   3. VALIDATE the client lists down to known SPACE_MODULES ids only, dropping any UNHIDEABLE id from the
//      hidden list (never trust the wire — the owner can never hide the shell / Danger / Module Manager).
//   4. MERGE into spaces.preferences.moduleMenu through the untyped admin client (ADR-246: the preferences
//      jsonb is not in the generated types), SCOPED to the resolved space id, preserving every other key.
//
// The FEATURE on/off toggle is a SEPARATE, already-shipped path (setSpaceFeatureEnabled in
// settings/features/actions.ts, owner/admin-gated, writing spaces.entitlements) — the Module Manager UI
// calls that directly; this action owns only the order + hidden overrides. No em dashes (owner copy,
// CONTENT-VOICE).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { sanitizeModuleOrder, sanitizeHiddenModules } from '@/lib/spaces/module-menu'
import { type ActionResult, ok, fail } from '@/lib/action-result'

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
 * Persist the Module Manager's menu overrides for a Space. Owner/admin-gated server-side
 * (getSpaceCapabilities.canManageMembers — a mere editor / staff previewer is refused). The order + hidden
 * lists are sanitized to known catalog ids (hidden additionally drops any unhideable id), then written to
 * spaces.preferences.moduleMenu, preserving every OTHER preferences key. Empty lists clear the node (back to
 * the catalog default). Returns ActionResult; on success revalidates the console + this page + the profile
 * so the reordered / hidden menu shows immediately.
 */
export async function saveSpaceModuleMenu(
  slug: string,
  input: { order?: unknown; hidden?: unknown },
): Promise<ActionResult> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return fail('Space not found.')

  // OWNER / ADMIN only — the same authority setSpaceFeatureEnabled enforces. Fail-closed for an editor or
  // a staff previewer (canManageMembers is false for both).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canManageMembers) return fail('You do not have permission to manage this menu.')

  const order = sanitizeModuleOrder(input.order)
  const hidden = sanitizeHiddenModules(input.hidden)

  // Merge into the existing preferences blob, preserving every other key.
  const current =
    space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? { ...(space.preferences as Record<string, unknown>) }
      : {}

  const node: Record<string, unknown> = {}
  if (order.length) node.order = order
  if (hidden.length) node.hidden = hidden
  if (Object.keys(node).length) current.moduleMenu = node
  else delete current.moduleMenu

  if (!(await updateSpacePreferences(space.id, current))) {
    return fail('Could not save your menu. Try again.')
  }

  revalidatePath(`/spaces/${slug}/manage`)
  revalidatePath(`/spaces/${slug}/manage/modules`)
  revalidatePath(`/spaces/${slug}`)
  return ok()
}
