'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionDef, DEFAULT_FUNCTION_ROLE, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// OWNER per-Space FEATURE actions (per-space-roles Phase 1). The owner (or admin) tunes their own
// space's tools from /spaces/<slug>/settings/features. Both actions RE-RESOLVE the space from the slug
// and re-gate caps.canManageMembers (owner / admin) server-side, so this can never be bypassed and a
// non-owner cannot tune someone else's space.
//
// The owner authority is WITHIN ENTITLEMENTS, narrower than the operator's:
//   • setSpaceFeatureEnabled — a UNIVERSAL function (no entitlement) is the owner's to toggle freely
//     (sparse: enabling deletes the key, disabling sets it false). A PLAN-GATED function may be turned
//     ON only if the plan already grants it (spaceHasEntitlement); turning it OFF is always allowed.
//     The owner can NEVER grant a plan-gated feature the plan lacks (that is the operator's absolute
//     override, /admin/spaces). A plan-gated function the plan lacks renders LOCKED in the panel.
//   • setSpaceFeatureMinRole — set the lowest role that may use a function; sparse against the code
//     default. Allowed for any function the space offers.
//
// Writes go through the service-role admin client SCOPED to the resolved space id (.eq('id', …)).
// Validates fn in the registry + role in the ladder. No em dashes (owner copy, CONTENT-VOICE).

/** Authorize the caller as a manager (owner / admin) of `slug`'s space; returns the resolved space id +
 *  its current jsonb blobs, or null on any miss. */
async function authorizeManager(slug: string): Promise<{
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

/** Enable or disable a function on the owner's own space. Owner/admin-gated. A plan-gated function can
 *  only be turned ON if the plan grants it; universal functions toggle freely. Returns ActionResult. */
export async function setSpaceFeatureEnabled(
  slug: string,
  fn: string,
  enabled: boolean,
): Promise<ActionResult> {
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')

  const auth = await authorizeManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const next = { ...auth.entitlements }
  if (def.entitlement) {
    // Plan-gated: ON requires the plan's entitlement (the owner can never out-grant their plan). OFF is
    // always allowed. We re-read the entitlement off the resolved space blob.
    if (enabled) {
      const hasPlan = next[def.entitlement] === true
      if (!hasPlan) return fail('Your plan does not include this feature yet. Upgrade to turn it on.')
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
  revalidatePath(`/spaces/${slug}/settings/features`)
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

  const auth = await authorizeManager(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const next = { ...auth.featureRoles }
  const key: SpaceFunctionKey = def.key
  if (role === DEFAULT_FUNCTION_ROLE[key]) delete next[key]
  else next[key] = role

  if (!(await updateSpaceBlob(auth.spaceId, { feature_roles: next }))) return fail('Could not save that change.')
  revalidatePath(`/spaces/${slug}/settings/features`)
  return ok()
}
