// Server-only signed-URL helpers for poster capture media. Poster scans and
// their crops live in the same PRIVATE bucket as card scans (network-contacts),
// under the uploader's auth-user folder — readers only ever get short-lived
// signed URLs (mirrors lib/connections/store.ts).

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const POSTER_BUCKET = 'network-contacts'

/** A short-lived signed URL for one stored poster image, or null. */
export async function posterSignedUrl(
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null
  const { data } = await createAdminClient().storage.from(POSTER_BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

/** Batch-sign many paths in one storage call → path → signed URL map. */
export async function posterSignedUrlMap(
  paths: string[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (!unique.length) return map
  const { data } = await createAdminClient().storage.from(POSTER_BUCKET).createSignedUrls(unique, expiresIn)
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl)
  }
  return map
}
