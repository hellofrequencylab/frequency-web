// ─────────────────────────────────────────────────────────────────────────────
// THE ASSETFIELD SEAM (PROG-D2, ADR-1130) — how a block document references a
// Loom asset instead of memorising a URL.
//
// PURE + framework-independent (no React / Next / Supabase), like ingest.ts and
// search-rank.ts, so the picker fields, the render walk, the SEO extractor and
// the server-side URL refresh all import the SAME contract.
//
// The shape (docs/LIBRARY.md §Best-practice architecture):
//
//   { assetId: '<library_assets.id>', url: '<cached CDN url>' }
//
//   • `assetId` is the REFERENCE — it survives an edit that re-points the live
//     asset at a new storage object (D3's version-on-edit), powers the usage
//     index (D4) and global swap.
//   • `url` is the DENORMALISED CACHE — the last URL the reference resolved to.
//     It is what renders when nothing re-resolves (a build without credentials,
//     a deleted asset, the editor canvas), so a document NEVER goes blank
//     because the library was unreachable. Fail-open to the cache, always.
//
// LEGACY STRINGS STAY LEGAL FOREVER. Every reader accepts `string | AssetRef`;
// a plain URL string is simply a reference-less value. That is what makes this
// a seam rather than a migration: no stored document needs rewriting (measured
// against the live database 2026-08-25 — zero block documents store a
// site-media URL; see ADR-1130), and any surface not yet writing refs keeps
// working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** A block-stored reference to a Loom asset: the id plus the cached CDN URL. */
export type AssetRef = {
  assetId: string
  url: string
  /** Optional alt text captured at pick time (the asset's own alt, if any). */
  alt?: string
}

/** An image value as stored in a block document: a legacy URL string or a reference. */
export type AssetValue = string | AssetRef

/** True when `value` is an AssetRef-shaped object (both keys present and non-empty).
 *  Deliberately conservative: an object missing either key is NOT a ref, so an
 *  unrelated `{ url }` config blob never gets rewritten by the walk below. */
export function isAssetRef(value: unknown): value is AssetRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return typeof v.assetId === 'string' && v.assetId.length > 0 && typeof v.url === 'string'
}

/** The renderable URL of a stored image value: a string passes through, a ref
 *  yields its cached URL, anything else is ''. The ONE read every consumer uses. */
export function assetRefUrl(value: unknown): string {
  if (typeof value === 'string') return value
  if (isAssetRef(value)) return value.url
  return ''
}

/** The referenced asset id, or null for a legacy string / empty value. */
export function assetRefId(value: unknown): string | null {
  return isAssetRef(value) ? value.assetId : null
}

// A React element must never be walked (its props are not ours) — same guard the
// BlockRender walk uses.
function isReactElement(value: object): boolean {
  return '$$typeof' in value
}

/**
 * Deep-replace every AssetRef in `value` with its cached URL string, so block
 * renderers keep receiving the plain strings they have always received.
 * IDENTITY-PRESERVING: returns the ORIGINAL value (same reference) when nothing
 * inside changed, so React memoisation and the BlockRender parity contract see
 * no difference on documents that carry no refs.
 */
export function deepResolveAssetRefs(value: unknown): unknown {
  if (isAssetRef(value)) return value.url
  if (!value || typeof value !== 'object') return value
  if (isReactElement(value)) return value
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((el) => {
      const out = deepResolveAssetRefs(el)
      if (out !== el) changed = true
      return out
    })
    return changed ? next : value
  }
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const out = deepResolveAssetRefs(v)
    if (out !== v) changed = true
    next[k] = out
  }
  return changed ? next : value
}

// UUID shape — the only asset ids the refresh will query. A stored document is
// author-controlled data; filtering here means one malformed id cannot fail the
// whole `.in()` batch (fail-open would then skip EVERY ref on the page).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every distinct, well-formed asset id referenced anywhere in `value`. */
export function collectAssetRefIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (isAssetRef(value)) {
    if (UUID_RE.test(value.assetId)) into.add(value.assetId)
    return into
  }
  if (!value || typeof value !== 'object') return into
  if (isReactElement(value)) return into
  if (Array.isArray(value)) {
    for (const el of value) collectAssetRefIds(el, into)
    return into
  }
  for (const v of Object.values(value as Record<string, unknown>)) collectAssetRefIds(v, into)
  return into
}

/**
 * Re-point every ref's cached URL at the CURRENT url for its asset id, leaving
 * refs whose asset is missing from the map (deleted, unreadable, not yet
 * resolved) exactly as cached — fail-open. Identity-preserving like
 * deepResolveAssetRefs, so an all-fresh document round-trips unchanged.
 */
export function applyAssetUrls(value: unknown, urlById: ReadonlyMap<string, string>): unknown {
  if (isAssetRef(value)) {
    const current = urlById.get(value.assetId)
    if (!current || current === value.url) return value
    return { ...value, url: current }
  }
  if (!value || typeof value !== 'object') return value
  if (isReactElement(value)) return value
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((el) => {
      const out = applyAssetUrls(el, urlById)
      if (out !== el) changed = true
      return out
    })
    return changed ? next : value
  }
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const out = applyAssetUrls(v, urlById)
    if (out !== v) changed = true
    next[k] = out
  }
  return changed ? next : value
}
