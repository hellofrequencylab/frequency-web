'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { spaceFunctionDef, DEFAULT_FUNCTION_ROLE, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { nextEntitlementsForFunctionToggle } from '@/lib/spaces/function-toggle'
import { isSpaceRole, type SpaceRole } from '@/lib/spaces/membership'

// OPERATOR per-Space FEATURE actions (per-space-roles Phase 1). The janitor-gated writes behind the
// "Features and access" grid on /admin/spaces/[id]. Two sparse, behavior-preserving merges into the
// existing jsonb columns (no new write path beyond these):
//   setSpaceFunctionEnabled — flip a function's ON switch, via the PURE resolver in
//       lib/spaces/function-toggle.ts (ADR-1197). The OFF switch is ALWAYS the function key, because
//       that is the only key spaceFunctionEnabled reads; the entitlement key is a separate ADDITIVE
//       grant that keeps the janitor override absolute (an operator may grant crm with no paid plan).
//       Conflating the two is what made this action a silent no-op for crm / email / shop / program.
//       The resolver returns null when a flip is refused for data safety (the `billing` key collision),
//       and this action surfaces that rather than swallowing it.
//   setSpaceFunctionMinRole — merge the function key into spaces.feature_roles; DELETE the key when the
//       role equals the CODE default, so the blob only ever holds genuine overrides ("no override =
//       today" holds, exactly like the capability_permissions grid).
//
// Both: requireAdmin('janitor') (the keys-to-the-keys), validate fn in the registry + role in the
// ladder, write through the service-role admin client SCOPED to the one space id (.eq('id', …)),
// revalidate the admin page. FAIL-CLOSED: an unknown fn/role returns an error before any write. No em
// dashes (operator copy, CONTENT-VOICE).

const ADMIN_PATH = '/admin/spaces'

/** Read a Space's current entitlements + feature_roles jsonb (untyped, ADR-246), normalized to plain
 *  records. Returns null if the space row is missing. */
async function readSpaceBlobs(
  spaceId: string,
): Promise<{ entitlements: Record<string, unknown>; featureRoles: Record<string, unknown> } | null> {
  const db = createAdminClient()
  const { data } = (await db
    .from('spaces')
    .select('id, entitlements, feature_roles')
    .eq('id', spaceId)
    .maybeSingle()) as { data: { id?: string; entitlements?: unknown; feature_roles?: unknown } | null }
  if (!data?.id) return null
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return { entitlements: asRecord(data.entitlements), featureRoles: asRecord(data.feature_roles) }
}

/** Write a Space's entitlements jsonb (scoped to the one id). Untyped update (ADR-246). */
async function writeEntitlements(spaceId: string, entitlements: Record<string, unknown>): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ entitlements }).eq('id', spaceId)
  return !error
}

/** Write a Space's feature_roles jsonb (scoped to the one id). Untyped update (ADR-246). */
async function writeFeatureRoles(spaceId: string, featureRoles: Record<string, unknown>): Promise<boolean> {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { error } = await db.from('spaces').update({ feature_roles: featureRoles }).eq('id', spaceId)
  return !error
}

/**
 * Turn a Space function ON or OFF (operator). Janitor-gated; the override is absolute (an operator may
 * grant a plan-gated function even with no plan). Sparse for universal functions (a default-on toggle
 * stores nothing when enabled). Returns ActionResult.
 */
export async function setSpaceFunctionEnabled(
  spaceId: string,
  fn: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requireAdmin('janitor')
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')
  if (!spaceId) return fail('We could not find that space.')

  const blobs = await readSpaceBlobs(spaceId)
  if (!blobs) return fail('We could not find that space.')

  // The decision lives in a PURE resolver (lib/spaces/function-toggle.ts) rather than here, because the
  // version written inline shipped wrong for four of the twenty-two functions and could not be reached
  // by a test to prove it (ADR-1197). `null` means the flip is refused for data safety.
  const next = nextEntitlementsForFunctionToggle(blobs.entitlements, def, enabled)
  if (!next) {
    return fail('Plan and billing cannot be switched off. It shares a key with the billing record.')
  }

  if (!(await writeEntitlements(spaceId, next))) return fail('Could not save that change.')
  revalidatePath(`${ADMIN_PATH}/${spaceId}`)
  revalidatePath(ADMIN_PATH)
  return ok()
}

/**
 * Set the lowest member role that may use a Space function (operator). Janitor-gated. Sparse: a role
 * equal to the CODE default DELETES the override key, so spaces.feature_roles only holds genuine
 * overrides. Validates fn in the registry + role in the ladder. Returns ActionResult.
 */
export async function setSpaceFunctionMinRole(
  spaceId: string,
  fn: string,
  role: SpaceRole | string,
): Promise<ActionResult> {
  await requireAdmin('janitor')
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')
  if (!isSpaceRole(role)) return fail('Unknown role.')
  if (!spaceId) return fail('We could not find that space.')

  const blobs = await readSpaceBlobs(spaceId)
  if (!blobs) return fail('We could not find that space.')

  const next = { ...blobs.featureRoles }
  const key: SpaceFunctionKey = def.key
  if (role === DEFAULT_FUNCTION_ROLE[key]) delete next[key]
  else next[key] = role

  if (!(await writeFeatureRoles(spaceId, next))) return fail('Could not save that change.')
  revalidatePath(`${ADMIN_PATH}/${spaceId}`)
  revalidatePath(ADMIN_PATH)
  return ok()
}
