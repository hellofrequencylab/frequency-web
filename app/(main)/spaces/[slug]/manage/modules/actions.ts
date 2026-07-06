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
// This file also owns the FEATURE writes the Module Manager calls directly (ADR-552 Phase 4, merged here
// from the retired settings/features surface so menu + features live in ONE place): setSpaceFeatureEnabled
// (on/off, spaces.entitlements) and setSpaceFeatureMinRole (the lowest role that may use a function,
// spaces.feature_roles). Both are owner/admin-gated the same way, so every Module Manager write shares one
// authority. No em dashes (owner copy, CONTENT-VOICE).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { sanitizeModuleOrder, sanitizeHiddenModules } from '@/lib/spaces/module-menu'
import { spaceFunctionDef, DEFAULT_FUNCTION_ROLE, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
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

// ── FEATURE writes (ADR-552 Phase 4, moved here from settings/features/actions.ts) ────────────────────
// The owner (or admin) tunes their own space's tools from the Module Manager. Both actions RE-RESOLVE the
// space from the slug and re-gate caps.canManageMembers (owner / admin) server-side, so this can never be
// bypassed and a non-owner cannot tune someone else's space. The owner authority is WITHIN ENTITLEMENTS,
// narrower than the operator's: a UNIVERSAL function (no entitlement) toggles freely; a PLAN-GATED function
// may be turned ON only if the plan already grants it, and OFF is always allowed.

/** Authorize the caller as a manager (owner / admin) of `slug`'s space; returns the resolved space id +
 *  its current jsonb blobs, or null on any miss. */
async function authorizeFeatureManager(slug: string): Promise<{
  spaceId: string
  entitlements: Record<string, unknown>
  featureRoles: Record<string, unknown>
} | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canManageMembers) return null // owner / admin only (not a mere editor)
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return {
    spaceId: space.id,
    entitlements: asRecord(space.entitlements),
    featureRoles: asRecord(space.featureRoles),
  }
}

/** Untyped scoped update of one of the space's jsonb columns (ADR-246), bound to the resolved id. */
async function updateSpaceBlob(spaceId: string, patch: Record<string, unknown>): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update(patch).eq('id', spaceId)
  return !error
}

/** Revalidate every surface a feature change touches: the console, the Module Manager, and the profile
 *  (the menu itself). */
function revalidateFeatureSurfaces(slug: string): void {
  revalidatePath(`/spaces/${slug}/manage`)
  revalidatePath(`/spaces/${slug}/manage/modules`)
  revalidatePath(`/spaces/${slug}`)
}

/** Enable or disable a function on the owner's own space. Owner/admin-gated. A plan-gated function can
 *  only be turned ON if the plan grants it; universal functions toggle freely. Returns ActionResult. */
export async function setSpaceFeatureEnabled(
  slug: string,
  fn: string,
  enabled: boolean,
): Promise<ActionResult> {
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')

  const auth = await authorizeFeatureManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const next = { ...auth.entitlements }
  if (def.entitlement) {
    // Plan-gated: ON requires the plan's entitlement (the owner can never out-grant their plan). OFF is
    // always allowed. We re-read the entitlement off the resolved space blob.
    if (enabled) {
      const hasPlan = next[def.entitlement] === true
      if (!hasPlan) return fail('Your plan does not include this feature yet. Move up a plan to turn it on.')
      // Already granted by the plan -> nothing to write (the switch is the entitlement itself).
      return ok()
    }
    delete next[def.entitlement]
  } else {
    // Universal: default-ON. Enabling -> delete key (back to default); disabling -> false (sparse).
    if (enabled) delete next[def.key]
    else next[def.key] = false
  }

  if (!(await updateSpaceBlob(auth.spaceId, { entitlements: next }))) return fail('Could not save that change.')
  revalidateFeatureSurfaces(slug)
  return ok()
}

/** Set the lowest role that may use a function on the owner's own space. Owner/admin-gated. Sparse
 *  against the code default. Returns ActionResult. */
export async function setSpaceFeatureMinRole(
  slug: string,
  fn: string,
  role: SpaceRole | string,
): Promise<ActionResult> {
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')
  if (!isSpaceRole(role)) return fail('Unknown role.')

  const auth = await authorizeFeatureManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const next = { ...auth.featureRoles }
  const key: SpaceFunctionKey = def.key
  if (role === DEFAULT_FUNCTION_ROLE[key]) delete next[key]
  else next[key] = role

  if (!(await updateSpaceBlob(auth.spaceId, { feature_roles: next }))) return fail('Could not save that change.')
  revalidateFeatureSurfaces(slug)
  return ok()
}
