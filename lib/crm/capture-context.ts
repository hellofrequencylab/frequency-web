// Read-side helper for the PUBLIC capture surfaces (front doors 2 to 5). These pages have no login,
// so they read the Space's display name through the service-role admin client. Fail-safe: a missing or
// renamed Space never breaks the page — it falls back to a neutral label.

import { createAdminClient } from '@/lib/supabase/admin'

/** The Space's public display name for capture-surface copy, or a neutral fallback. Never throws. */
export async function loadSpaceName(spaceId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('spaces').select('name').eq('id', spaceId).maybeSingle()
    const name = (data as { name?: string } | null)?.name
    return name && name.trim().length ? name.trim() : 'this space'
  } catch {
    return 'this space'
  }
}
