// KEY-SCOPED PREFERENCES PATCH (LIVE-2347). The Page panel and the page editor build the next
// spaces.preferences object with pure mutators (withPageDoc, addPage, nextHeroPreferences, ...) from a
// snapshot read at the start of the request. Writing that whole object back would undo any other key a
// second console saved in the meantime (a Spotlight publish, a website editor stub, a menu save). This
// turns the before/after pair into a patch of ONLY the top-level keys the mutator changed, for
// patchSpacePreferences (set_space_preferences, SCAN-833): a changed or added key carries its new value,
// a removed key carries null (the function deletes it), and every untouched key is left out.
//
// websiteEditor and programOverview are never in the patch: save_website_editor and space_private_state
// own them (SCAN-827), the function refuses them, and none of these writers changes them.

import { PROGRAM_OVERVIEW_KEY } from '@/lib/spaces/leadership'

const RESERVED = new Set(['websiteEditor', PROGRAM_OVERVIEW_KEY])

/** Structural equality for JSON-shaped values (object key order ignored). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => sameJson(v, bb[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined)
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined)
  return ak.length === bk.length && ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && sameJson(ao[k], bo[k]))
}

/** The top-level keys that differ between `before` and `after`, as a set_space_preferences patch:
 *  `after`'s value for a changed or added key, null for a key `after` dropped (or set to undefined). */
export function preferencesPatch(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (RESERVED.has(key)) continue
    const next = after[key]
    const prev = before[key]
    if (next === undefined) {
      if (prev !== undefined) patch[key] = null
    } else if (!sameJson(prev, next)) {
      patch[key] = next
    }
  }
  return patch
}
