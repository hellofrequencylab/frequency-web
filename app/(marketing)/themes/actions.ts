'use server'

import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { siteTheme } from '@/lib/theme/site-style'

// "Your site is on <theme>" (LIVE-1866). /themes is static (revalidate 3600), so the one fact that depends on who is looking
// is read here, after the page is up: the theme the signed-in person's first Space website wears. Signed out, no Space, or any
// error: null, and the page shows no chip. Reads under the person's own session; nothing is written.
export async function myThemeAction(): Promise<{ theme: string; slug: string } | null> {
  try {
    const profileId = await getMyProfileId()
    if (!profileId) return null
    const db = await createClient()
    const { data } = await db.from('spaces').select('slug, preferences').eq('owner_profile_id', profileId).eq('status', 'active').order('created_at').limit(1).maybeSingle()
    if (!data) return null
    return { theme: siteTheme(data.preferences), slug: data.slug }
  } catch {
    return null
  }
}
