import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

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
