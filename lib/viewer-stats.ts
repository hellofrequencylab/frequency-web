import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/auth'
import { rankForZaps } from '@/lib/season-ranks'
import type { ViewerGamStats } from '@/components/ui/page-header'

// The signed-in viewer's gamification stats (rank derived from zaps), for the
// shared PageHeader. Null when signed out. Server-only.
//
// Own-row read via the session client (RLS-covered); see ADR-042.
export async function getViewerGamStats(): Promise<ViewerGamStats | null> {
  const user = await getCachedUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('current_season_zaps, lifetime_gems, current_streak')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const p = data as { current_season_zaps?: number; lifetime_gems?: number; current_streak?: number } | null
  if (!p) return null

  const zaps = p.current_season_zaps ?? 0
  return { zaps, gems: p.lifetime_gems ?? 0, streak: p.current_streak ?? 0, rank: rankForZaps(zaps) }
}