'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { spaceFunctionDef, DEFAULT_FUNCTION_ROLE, isSpaceType, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { isSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
import {
  upsertSpaceFunctionTypeDefault,
  deleteSpaceFunctionTypeDefault,
} from '@/lib/spaces/type-defaults'

// OPERATOR per-TYPE function-defaults actions (per-space-roles Phase 2). The janitor-gated writes behind
// the type-defaults grid (/admin/spaces/defaults). They tune what every NEW Space of a type starts with:
// each (type, fn) row carries an ON/OFF + a lowest-role. The table is SPARSE: a row equal to the CODE
// default is DELETED (back to the code default), so space_function_type_defaults only ever holds genuine
// overrides and an untouched type seeds exactly as today.
//
// Both actions: requireAdmin('janitor') (the keys-to-the-keys), VALIDATE type in SpaceType + fn in the
// registry + role in the ladder before any write (the table columns are text, the vocabulary is owned by
// the TypeScript unions), write through the service-role admin client (type-defaults.ts), revalidate the
// editor. FAIL-CLOSED: an unknown type / fn / role returns an error before any write. No em dashes.

const PATH = '/admin/spaces/defaults'

/** Set a per-type function default: its ON/OFF and lowest-role for new Spaces of `type`. Janitor-gated.
 *  SPARSE: when both the enabled flag is the default (ON) AND the role equals the code default, the row
 *  is DELETED so the (type, fn) returns to the pure code default. Otherwise it is upserted. Validates the
 *  whole tuple against the registry. Returns ActionResult. */
export async function setTypeFunctionDefault(
  type: string,
  fn: string,
  enabled: boolean,
  role: SpaceRole | string,
): Promise<ActionResult> {
  const ctx = await requireAdmin('janitor')
  if (!isSpaceType(type)) return fail('Unknown space type.')
  const def = spaceFunctionDef(fn)
  if (!def) return fail('Unknown function.')
  if (!isSpaceRole(role)) return fail('Unknown role.')

  const key: SpaceFunctionKey = def.key
  const isCodeDefault = enabled === true && role === DEFAULT_FUNCTION_ROLE[key]

  // SPARSE: a row that matches the code default is removed, not stored, so the table only holds genuine
  // overrides and an empty table seeds exactly as today.
  const written = isCodeDefault
    ? await deleteSpaceFunctionTypeDefault(type, key)
    : await upsertSpaceFunctionTypeDefault(type, key, enabled, role, ctx.profileId)

  if (!written) return fail('Could not save that default.')
  revalidatePath(PATH)
  return ok()
}
