'use client'

// THE ONE CLIENT PATH for describing a SERVER-GENERATED image (HYG-021, ADR-1254).
//
// A generator hands back a stored asset: an id and a public URL, with a checksum and header
// dimensions already on the row and `blurhash`/`colors` still NULL, because the server that made it
// decodes no pixels and must not start (docs/DEPLOY-SAFETY.md — `sharp` in the Loom write seam is
// the 2026-08-11 ENOSPC fan-out). This is the missing half, and it lives HERE, once, so the two
// surfaces that generate images cannot drift into two slightly different versions of it.
//
// It is best-effort in every direction: the fetch, the decode and the write all fail to `false`, and
// the caller carries on. A missing placeholder costs a fraction of a second of flat colour; nothing
// a person is doing should ever wait on it, which is why callers fire it beside their own success
// path rather than in front of it.

import { appendImageDescriptor, describeImageUrl } from './image-describe'
import { describeLibraryAssetAction } from './describe-actions'

/**
 * Decode a just-generated image in this browser and post its blurhash + palette to the asset row.
 *
 * @param assetId the `library_assets` row the generator just wrote
 * @param url     that asset's public URL
 * @returns whether anything was actually written (false on any miss, including "already described")
 */
export async function describeGeneratedAsset(assetId: string, url: string): Promise<boolean> {
  if (!assetId || !url) return false
  try {
    const descriptor = await describeImageUrl(url)
    // Nothing worth a round-trip: a vector, a failed decode, or a canvas that gave up.
    if (!descriptor || (!descriptor.blurhash && descriptor.colors.length === 0)) return false
    const form = new FormData()
    appendImageDescriptor(form, descriptor)
    const res = await describeLibraryAssetAction(assetId, form)
    return 'ok' in res && res.written.length > 0
  } catch {
    return false
  }
}

/** The same thing for a set of assets one generation produced (the Loom Studio asks for up to four
 *  at a time). Runs them together; one failure never stops the others. */
export async function describeGeneratedAssets(
  assets: readonly { id: string; url: string }[],
): Promise<number> {
  const done = await Promise.all(assets.map((a) => describeGeneratedAsset(a.id, a.url)))
  return done.filter(Boolean).length
}
