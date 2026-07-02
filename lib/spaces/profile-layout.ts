// The SAVED-LAYOUT merge for the block-picker space profile (Epic 1.7, S3 editor). PURE +
// framework-independent (no React / Next / Supabase imports) so it is trivially unit-testable, like
// its S1/S2 siblings profile-blocks.ts + profile-modules.ts. It answers: "given the fresh-default
// ordered layout for a space AND the operator's saved edits, what ordered block list does the profile
// actually render?" — by applying the saved order, dropping hidden blocks, appending default blocks the
// operator has not touched, and dropping saved ids that are no longer in the default (a feature turned
// off, or a block retired from the registry). FAIL-SAFE throughout: a malformed / absent saved blob
// reads as null and the fresh default stands unchanged, so a bad preferences row never breaks a profile.

import type { SpaceType } from './types'
import { profileBlockById, type ProfileBlockId } from './profile-blocks'
import { resolveProfileLayout } from './profile-modules'

/** The operator's saved block-picker edits, persisted at spaces.preferences.profileLayout. Both keys
 *  optional: `order` is the arranged sequence of block ids, `hidden` the ids toggled off. Only known
 *  ProfileBlockIds survive the parse; the merge tolerates any stale/extra ids. */
export interface SavedProfileLayout {
  order?: ProfileBlockId[]
  hidden?: ProfileBlockId[]
}

/** Keep only valid, de-duplicated ProfileBlockIds from an unknown array; a non-array yields []. */
function cleanBlockIds(value: unknown): ProfileBlockId[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<ProfileBlockId>()
  const out: ProfileBlockId[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    if (profileBlockById(v) === null) continue // ignore unknown / retired ids
    const id = v as ProfileBlockId
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Fail-safe read of the saved block-picker layout off a preferences blob. Reads
 * `preferences.profileLayout`, keeps only known ProfileBlockIds in `order` / `hidden`, and returns
 * null for anything that is not a plain object (a wrong shape, an array, a primitive, absent). Pure +
 * total: an unknown id is dropped, never thrown.
 */
export function parseSavedProfileLayout(preferences: unknown): SavedProfileLayout | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  const raw = (preferences as Record<string, unknown>).profileLayout
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const order = cleanBlockIds(r.order)
  const hidden = cleanBlockIds(r.hidden)
  const out: SavedProfileLayout = {}
  if (order.length) out.order = order
  if (hidden.length) out.hidden = hidden
  return out
}

/**
 * Apply the operator's saved edits over the fresh-default layout. RULES:
 *   • saved `order` sequences the blocks (only ids still present in the default survive, so a feature
 *     turned off or a retired block silently drops);
 *   • `hidden` ids are dropped from the result;
 *   • any default block the saved layout never mentions is APPENDED in default order (a new block a
 *     feature just enabled shows up without the operator having to re-open the editor);
 *   • the result NEVER contains an id absent from `defaultLayout`.
 * FAIL-SAFE: a null saved layout returns the default unchanged (a fresh copy).
 */
export function mergeProfileLayout(
  defaultLayout: ProfileBlockId[],
  saved: SavedProfileLayout | null,
): ProfileBlockId[] {
  if (!saved) return [...defaultLayout]
  const inDefault = new Set(defaultLayout)
  const hidden = new Set((saved.hidden ?? []).filter((id) => inDefault.has(id)))
  const placed = new Set<ProfileBlockId>()
  const out: ProfileBlockId[] = []
  // 1. Saved order first, dropping ids no longer in the default and any hidden id.
  for (const id of saved.order ?? []) {
    if (!inDefault.has(id) || hidden.has(id) || placed.has(id)) continue
    placed.add(id)
    out.push(id)
  }
  // 2. Append remaining default blocks (untouched or newly enabled), in default order, minus hidden.
  for (const id of defaultLayout) {
    if (placed.has(id) || hidden.has(id)) continue
    placed.add(id)
    out.push(id)
  }
  return out
}

/**
 * The EFFECTIVE ordered profile layout for a space: the fresh default for its type + function set
 * (resolveProfileLayout), with the operator's saved edits (read off the preferences blob) merged over
 * it. The one call a renderer makes to honor saved block-picker edits. Fail-safe: a malformed blob
 * parses to null and the fresh default stands.
 */
export function effectiveProfileLayout(
  space: { type: SpaceType; entitlements?: unknown },
  preferences: unknown,
): ProfileBlockId[] {
  return mergeProfileLayout(resolveProfileLayout(space), parseSavedProfileLayout(preferences))
}
