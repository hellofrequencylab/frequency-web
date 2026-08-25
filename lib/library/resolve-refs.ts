import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { applyAssetUrls, collectAssetRefIds } from './asset-ref'

// ─────────────────────────────────────────────────────────────────────────────
// RENDER-PATH RESOLUTION (PROG-D2, ADR-1130): reference → current CDN URL.
//
// A block document stores { assetId, url } — the reference plus a cached URL
// (lib/library/asset-ref.ts). This is the server half: before a published
// document renders, re-point every ref's cache at the asset's CURRENT url, so a
// D3 edit that re-points the live row (a crop, a background removal, a version
// rollback) shows up on the page without re-saving every document that uses it.
//
// FAIL-OPEN TO THE CACHE, deliberately and at every grain:
//   • no refs in the document → no query, the document returns untouched
//     (identity-preserved) — a legacy all-string document costs nothing;
//   • the query fails or credentials are absent (a static build) → the cached
//     urls stand and the page still renders;
//   • one asset is deleted → that one ref keeps its cache; the rest refresh.
// A swallowed error is an invisible regression ONLY when nothing measures the
// consequence — here the cache IS the designed consequence of a failed refresh,
// and blurhash-less flat cards (HYG-021) are what a stale cache degrades to,
// not a blank page.
//
// 🔴 No pixels, no sharp, no next/og — this module is a batched `select id,url`
// and nothing else (docs/DEPLOY-SAFETY.md; check:og-trace has sharp at 67/100
// in exactly this seam).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh every AssetRef cache in a published block document. Returns the same
 * document object when nothing needed refreshing.
 */
export async function refreshAssetRefUrls<T>(data: T): Promise<T> {
  const ids = [...collectAssetRefIds(data)]
  if (ids.length === 0) return data
  try {
    const { data: rows, error } = await createAdminClient()
      .from('library_assets')
      .select('id, url')
      .in('id', ids)
    if (error || !rows) return data
    const urlById = new Map<string, string>()
    for (const r of rows as { id: string; url: string | null }[]) {
      if (typeof r.url === 'string' && r.url.length > 0) urlById.set(r.id, r.url)
    }
    if (urlById.size === 0) return data
    return applyAssetUrls(data, urlById) as T
  } catch {
    return data
  }
}
