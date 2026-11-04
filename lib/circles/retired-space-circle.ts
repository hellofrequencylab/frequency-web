import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// WHERE A RETIRED SPACE CIRCLE'S LINKS GO (ADR-1938, LIVE-2080).
//
// Every Space used to carry a built-in Circle (circles.is_space_primary). The cutover migration
// (20270346029500) archived them all and kept their slugs, so a link anyone saved, printed or shared
// still resolves: /circles/<slug> and /discover/circles/<slug|id> 308 to the Space's Community page,
// the wall that replaced the Circle. Only a Space Circle is forwarded; any other archived Circle
// keeps its 404. The platform root lends no Space page, so its Circle (if one ever existed) is not
// forwarded either.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Community page a Space Circle's old URL now lives at, or null when this is not one. */
export const retiredSpaceCircleHome = cache(async (slugOrId: string): Promise<string | null> => {
  if (!slugOrId) return null
  try {
    const { data } = await createAdminClient()
      .from('circles')
      .select('space:spaces!space_id ( slug, type )')
      .eq(UUID.test(slugOrId) ? 'id' : 'slug', slugOrId)
      .eq('is_space_primary', true)
      .maybeSingle()
    const space = (data as { space: { slug: string | null; type: string | null } | null } | null)?.space
    if (!space?.slug || space.type === 'root') return null
    return `/spaces/${space.slug}/community`
  } catch {
    return null
  }
})
