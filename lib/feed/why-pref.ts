import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// "Show why I see things" (Settings, Feed): the short reason the Feed prints on a pick or a post
// ("From your Circle", "Near you"). On by default; a member who turns it off stores
// profiles.meta.feedWhyHidden = true (the same per-member settings store the leaderboard opt-out uses,
// no migration). The Feed's posts stream and its planner read it through feedWhyShown.

/** Pure read: does this meta say the member wants the reasons hidden? */
export function hidesFeedWhy(meta: Record<string, unknown> | null | undefined): boolean {
  return Boolean(meta?.feedWhyHidden)
}

/** Request-cached: should the Feed print its why-labels for this member? Fails open (shown). The member's
 *  own row, so the session client under RLS reads it. */
export const feedWhyShown = cache(async (profileId: string): Promise<boolean> => {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    return !hidesFeedWhy((data as { meta?: Record<string, unknown> | null } | null)?.meta)
  } catch {
    return true
  }
})
