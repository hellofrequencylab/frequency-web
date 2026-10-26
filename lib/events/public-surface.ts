// THE THEME GROUND OF A PUBLIC EVENT PAGE (LIVE-1368). An event hosted by a Space on a Mega Theme that owns
// a ground (Midnight) reads in that ground for a signed-out visitor too. ANONYMOUS PUBLIC CLIENT ONLY, no
// cookies, no service role: the page keeps its ISR window, and both columns read here are anon-granted
// (events.host_space_id; spaces.preferences, migration 20270127000000). Fail-soft: any miss reads as no
// ground, which is the page as it was.

import { createPublicClient } from '@/lib/supabase/public'
import { pageSurface } from '@/lib/theme/surface'
import type { ThemeSurface } from '@/lib/theme/surface-vars'

export async function getPublicEventSurface(slug: string): Promise<ThemeSurface | null> {
  try {
    const supabase = createPublicClient()
    const { data: event } = await supabase.from('events').select('host_space_id').eq('slug', slug).limit(1).maybeSingle()
    const hostSpaceId = (event as { host_space_id: string | null } | null)?.host_space_id
    if (!hostSpaceId) return null
    const { data: space } = await supabase.from('spaces').select('preferences').eq('id', hostSpaceId).eq('status', 'active').maybeSingle()
    return pageSurface((space as { preferences: unknown } | null)?.preferences)
  } catch {
    return null
  }
}
