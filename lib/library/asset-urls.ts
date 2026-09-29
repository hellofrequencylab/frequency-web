import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'
import { renditionUrl } from './rendition-url'
import type { LoomPickAsset } from './store'

/**
 * Live Loom urls for a set of library_assets ids, one query. Empty input is a no-op so a
 * page that never stored a companion does not talk to the catalog. Fail-open: a miss is
 * simply absent from the map, and columnImageUrl keeps the cached url.
 */
export async function loadLibraryAssetUrls(
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [
    ...new Set([...ids].filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ]
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  const { data } = await createAdminClient()
    .from('library_assets')
    .select('id, url')
    .in('id', unique)
  for (const row of data ?? []) {
    if (row.id && row.url) out.set(row.id, row.url)
  }
  return out
}

/** How long a Studio signed URL lives: one working session in the drawer and grid. It is minted per
 *  page render and never stored, so a short life costs a refresh, never a broken page. */
export const LIBRARY_SIGNED_URL_TTL_SECONDS = 60 * 60

/** The fields `signedLibraryAssetUrl` reads; `LibraryGalleryItem` satisfies it. */
export type SignableLibraryAsset = {
  isProtected: boolean
  url: string | null
  storagePath: string | null
}

/**
 * THE ONE SIGNING FUNCTION for a Loom asset (LIVE-577, ADR-1595). A protected asset whose file sits
 * in `library-private` gets a short-lived signed URL minted through the admin client; every other
 * asset gets its stored url back unchanged, so a caller never branches on the bucket itself.
 *
 * The test is the stored url, by the protect move's invariant (lib/library/protect-move.ts): `url` is
 * null exactly when the file is private. A row LIVE-576 flagged before this bucket existed still has
 * its public url and its file in library-media, so it is served by that url until its drawer is saved.
 *
 * Never store what this returns: a signed URL is a stored expiry (lib/events/series-seo.ts). A failed
 * mint is null, which the Studio's thumbnail renders as its no-image placeholder.
 */
export async function signedLibraryAssetUrl(
  asset: SignableLibraryAsset,
  ttlSeconds: number = LIBRARY_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!asset.isProtected || asset.url) return asset.url
  if (!asset.storagePath) return null
  try {
    const { data } = await createAdminClient()
      .storage.from(LIBRARY_PRIVATE_BUCKET)
      .createSignedUrl(asset.storagePath, ttlSeconds)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PROOF (LIVE-580, ADR-1623; owner ruling 2026-09-29: "Width-capped proof, no watermark").
//
// A protected asset is shown as a PROOF, never as its original: a signed URL minted with a storage
// transform (the grid preset's width, resize contain), so storage serves the private object resized
// and nothing in this app decodes a pixel (the og-trace budget, docs/DEPLOY-SAFETY.md). The master
// leaves the bucket only through the download door (LIVE-578).
//
// ⚠️ WHAT THE CAP BINDS, stated honestly. Storage puts the transform inside the signed token, so the
// holder cannot widen the proof by editing the query. It does NOT stop the same token opening the
// object endpoint: supabase/storage's getSignedObject verifies the same download scope and ignores
// the token's transformations, so a proof URL with `/render/image/sign/` swapped for
// `/object/sign/` serves the master until the token expires. That is why a proof lives minutes, not
// the hour a Studio signature lives, and why every reader that gets one is already a manager of the
// asset (staff in the Studio, an editor or owner in the picker). A cap that holds against a knowing
// holder needs a stored proof object, which HYG-017's "nothing writes derivative files" rules out;
// that is an owner question, recorded in ADR-1623, not a silent gap.
// ─────────────────────────────────────────────────────────────────────────────

/** A proof's width: the grid preset (RENDITION_PRESETS.grid, a browser gallery card). */
export const LIBRARY_PROOF_WIDTH = 480

/** How long a proof lives: one sitting in a grid. Short on purpose (see the header above). */
export const LIBRARY_PROOF_TTL_SECONDS = 15 * 60

/** The fields `proofLibraryAssetUrl` reads. `kind` is optional: audio and video have no proof. */
export type ProofableLibraryAsset = SignableLibraryAsset & { kind?: string | null }

const isVectorPath = (p: string | null) => typeof p === 'string' && /\.svgz?$/i.test(p.split('?')[0])

/**
 * The display URL for a Loom asset that may be protected (LIVE-580). A protected image whose file is
 * private gets a width-capped signed proof; a protected row whose file is still public (flagged before
 * its drawer was saved) gets the public grid rendition, never the master; every unprotected asset gets
 * `renditionUrl(url, 'grid')`, the thumbnail it always had.
 *
 * Null when no proof can be shown: a protected vector (a proof of an SVG is the SVG, and rasterising it
 * is a decode), a protected row with no file, or a failed mint. The Studio renders its no-image
 * placeholder for null. Never store what this returns: it expires.
 */
export async function proofLibraryAssetUrl(
  asset: ProofableLibraryAsset,
  ttlSeconds: number = LIBRARY_PROOF_TTL_SECONDS,
): Promise<string | null> {
  // Audio and video cannot be private (protectLibraryAsset refuses them), and an image transform of
  // one is a broken player: served as they are.
  if (asset.kind === 'audio' || asset.kind === 'video') return asset.url
  if (asset.url) {
    if (asset.isProtected && isVectorPath(asset.url)) return null
    return renditionUrl(asset.url, 'grid')
  }
  if (!asset.isProtected || !asset.storagePath || isVectorPath(asset.storagePath)) return null
  try {
    const { data } = await createAdminClient()
      .storage.from(LIBRARY_PRIVATE_BUCKET)
      .createSignedUrl(asset.storagePath, Math.min(ttlSeconds, LIBRARY_PROOF_TTL_SECONDS), {
        transform: { width: LIBRARY_PROOF_WIDTH, resize: 'contain' },
      })
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

/**
 * A Loom pick list made safe to render (LIVE-580): every protected row's `url` becomes its proof and
 * its `storagePath` is dropped before the list reaches a browser. A protected row with no proof is
 * dropped, since there is nothing to show. The picker renders a protected row and refuses to place it,
 * so a proof is never stored in a document (a stored signed URL is a stored expiry).
 */
export async function withLoomProofs(assets: LoomPickAsset[]): Promise<LoomPickAsset[]> {
  const out = await Promise.all(
    assets.map(async ({ storagePath, ...a }) => {
      if (!a.isProtected) return a
      const url = await proofLibraryAssetUrl({ isProtected: true, url: a.url || null, storagePath: storagePath ?? null, kind: a.kind })
      return url ? { ...a, url } : null
    }),
  )
  return out.filter((a): a is LoomPickAsset => a !== null)
}
