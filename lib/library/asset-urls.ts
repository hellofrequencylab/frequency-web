import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'

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
