import 'server-only'

import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

// ONE ASSET'S WORDS: title, alt and tags (LIVE-568, ADR-1586).
//
// Two doors edit these three fields, and they must agree on what a valid value is:
//   · the Loom Studio drawer (app/(main)/admin/library/actions.ts updateLibraryAssetMeta), gated by
//     the Studio's own requireAdmin, which may touch any row;
//   · the Space Loom Studio (lib/loom/picker-actions.ts updateSpaceLoomImageMeta), gated by the
//     Space's `loom` function (canManageSpaceLoom), which may touch only that Space's rows.
// `normalizeAssetMeta` is the validation both call, so a title that is refused in one is refused in
// the other. `updateSpaceLibraryAssetMeta` is the Space door's write, BOUND to space_id in the
// query itself: an id from another Space matches no row and updates nothing, whatever the caller
// authorized (the deleteSpaceLibraryAsset shape in lib/library/store.ts).

type AssetUpdate = Database['public']['Tables']['library_assets']['Update']

/** The three fields a person edits on one asset. Tags arrive as one comma-separated string (the
 *  drawer's and the Space editor's single input). Every field is optional and independent. */
export type AssetMetaFields = { title?: unknown; alt?: unknown; tags?: unknown }

export type AssetMetaPatch = Pick<AssetUpdate, 'title' | 'alt' | 'tags'>

/** Validate and shape title / alt / tags into a row patch. PURE. A field left undefined is not in
 *  the patch. Title: required when sent, trimmed, at most 200. Alt: trimmed, at most 500, empty
 *  clears it. Tags: split on commas, trimmed, lowercased, empties dropped, at most 40. A value that
 *  is not a string (a server action's input is never trusted) is refused, not thrown on. */
export function normalizeAssetMeta(fields: AssetMetaFields): { ok: true; patch: AssetMetaPatch } | { error: string } {
  const patch: AssetMetaPatch = {}
  if (fields.title !== undefined) {
    if (typeof fields.title !== 'string') return { error: 'Title needs to be text.' }
    const t = fields.title.trim()
    if (!t) return { error: 'Title cannot be empty.' }
    patch.title = t.slice(0, 200)
  }
  if (fields.alt !== undefined) {
    if (typeof fields.alt !== 'string') return { error: 'Alt text needs to be text.' }
    patch.alt = fields.alt.trim().slice(0, 500) || null
  }
  if (fields.tags !== undefined) {
    if (typeof fields.tags !== 'string') return { error: 'Tags need to be text, separated by commas.' }
    patch.tags = fields.tags
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
  }
  return { ok: true, patch }
}

/** Write a validated patch onto ONE asset of ONE Space. The update is bound to `space_id` as well as
 *  `id`, so an asset that is not this Space's matches nothing: 'missing', never a cross-Space write.
 *  The caller has authorized the Space. 'failed' is a database error. */
export async function updateSpaceLibraryAssetMeta(
  spaceId: string,
  assetId: string,
  patch: AssetMetaPatch,
): Promise<'ok' | 'missing' | 'failed'> {
  if (!spaceId || !assetId) return 'missing'
  try {
    const { data, error } = await createAdminClient()
      .from('library_assets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', assetId)
      .eq('space_id', spaceId)
      .select('id')
      .maybeSingle()
    if (error) return 'failed'
    return data ? 'ok' : 'missing'
  } catch {
    return 'failed'
  }
}
