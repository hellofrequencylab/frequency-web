// COLUMN-BACKED IMAGE CACHE (HYG-068, ADR-1436).
//
// JSONB surfaces store `{ assetId, url }` (lib/library/asset-ref.ts). These six columns cannot:
// they are TEXT, and stuffing JSON in them would render as nothing. The companion `*_asset_id`
// is the reference; the url column stays the denormalised cache. PURE — no React / Next /
// Supabase — so pickers, save actions, and mappers share one split.
//
// Fail-open: a missing or unread asset keeps the cached url. A write that changes the url
// without an id MUST clear the companion, or the id would point at a different picture.

import type { AssetPick } from './asset-ref'

/** One column-backed image: the cache plus the optional Loom id. */
export type ColumnImage = {
  url: string | null
  assetId: string | null
}

/** Split a Loom pick (or a clear) into the two columns a TEXT image field stores. */
export function columnImageFromPick(pick: AssetPick | null | undefined): ColumnImage {
  if (!pick || !pick.url) return { url: null, assetId: null }
  return { url: pick.url, assetId: pick.assetId ?? null }
}

/** The url a reader should paint: the live Loom url when we have one, else the cache. */
export function columnImageUrl(
  cached: string | null | undefined,
  assetId: string | null | undefined,
  liveById: ReadonlyMap<string, string>,
): string | null {
  if (assetId) {
    const live = liveById.get(assetId)
    if (live) return live
  }
  const url = cached?.trim()
  return url || null
}

/**
 * Patch both halves of one column-backed image. Passing a url without an id CLEARS the
 * companion, so a paste or a server upload that is not in the Loom cannot leave a stale id.
 */
export function columnImagePatch(
  urlCol: string,
  idCol: string,
  image: ColumnImage,
): Record<string, string | null> {
  return { [urlCol]: image.url, [idCol]: image.assetId }
}
