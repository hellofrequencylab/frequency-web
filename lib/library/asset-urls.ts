import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'
import { renditionUrl } from './rendition-url'
import type { LoomPickAsset } from './store'
import { libraryProofPath, writeLibraryProof } from './proof-object'

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
 *
 * `opts.download` (LIVE-578, the download door) names the file storage should serve as an attachment;
 * it is only ever passed with a one-minute ttl, by app/api/library/download/[id]/route.ts.
 */
export async function signedLibraryAssetUrl(
  asset: SignableLibraryAsset,
  ttlSeconds: number = LIBRARY_SIGNED_URL_TTL_SECONDS,
  opts?: { download?: string },
): Promise<string | null> {
  if (!asset.isProtected || asset.url) return asset.url
  if (!asset.storagePath) return null
  try {
    const { data } = await createAdminClient()
      .storage.from(LIBRARY_PRIVATE_BUCKET)
      .createSignedUrl(asset.storagePath, ttlSeconds, opts?.download ? { download: opts.download } : undefined)
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PROOF (LIVE-580, ADR-1623; owner rulings 2026-09-29 "Width-capped proof, no watermark" and
// "Store a small proof file").
//
// A protected asset is shown as a PROOF, never as its original. The proof is its own object in
// `library-private` at `proofs/<storage_path>` (lib/library/proof-object.ts), written when the asset
// is protected and lazily for one that has none. This signs THAT object and never the master: the
// token names the proof's path, storage checks it on every route, so no edit of a proof link reaches
// the original. The master leaves the bucket only through the download door (LIVE-578).
// ─────────────────────────────────────────────────────────────────────────────

export { LIBRARY_PROOF_WIDTH } from './proof-object'

/** How long a proof link lives: the Studio signature's hour, and never longer however it is asked. */
export const LIBRARY_PROOF_TTL_SECONDS = LIBRARY_SIGNED_URL_TTL_SECONDS

/** The fields `proofLibraryAssetUrl` reads. `kind` is optional: audio and video have no proof. */
export type ProofableLibraryAsset = SignableLibraryAsset & { kind?: string | null }

const isVectorPath = (p: string | null) => typeof p === 'string' && /\.svgz?$/i.test(p.split('?')[0])

/**
 * The display URL for a Loom asset that may be protected (LIVE-580). A protected image whose file is
 * private gets a signed link to its stored proof, written first if it is missing; every unprotected
 * asset gets `renditionUrl(url, 'grid')`, the thumbnail it always had.
 *
 * Null when no proof can be shown: a protected row whose file is still public (flagged before its
 * drawer was saved: any link to it is a link to a public master), a protected vector (rasterising it
 * is a decode), a protected row with no file, or a proof that could not be written or signed. Every
 * surface renders its no-image placeholder for null. Never store what this returns: it expires.
 */
export async function proofLibraryAssetUrl(
  asset: ProofableLibraryAsset,
  ttlSeconds: number = LIBRARY_PROOF_TTL_SECONDS,
): Promise<string | null> {
  // Audio and video cannot be private (protectLibraryAsset refuses them), and an image transform of
  // one is a broken player: served as they are.
  if (asset.kind === 'audio' || asset.kind === 'video') return asset.url
  if (!asset.isProtected) return asset.url ? renditionUrl(asset.url, 'grid') : null
  if (asset.url || !asset.storagePath || isVectorPath(asset.storagePath)) return null
  const proofPath = libraryProofPath(asset.storagePath)
  const ttl = Math.min(ttlSeconds, LIBRARY_PROOF_TTL_SECONDS)
  const sign = async () => {
    try {
      const { data } = await createAdminClient().storage.from(LIBRARY_PRIVATE_BUCKET).createSignedUrl(proofPath, ttl)
      return data?.signedUrl ?? null
    } catch {
      return null
    }
  }
  // Signing a missing object fails, which is the cheap "is there a proof yet" test: write it, then sign.
  const first = await sign()
  if (first) return first
  if (!(await writeLibraryProof(asset.storagePath))) return null
  return sign()
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
