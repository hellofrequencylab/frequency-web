// Journey completion reads for the Quest rank system.
//
// Rank = how many Journeys a member finishes this season (ADR-Quest completion model).
// The canonical completion record is a row in `journey_completions` (one per
// member/journey/season, written ONLY by the completion engine in
// lib/quest/complete.ts once the 14-distinct-days + Expression Challenge bar is met).
// Counting those rows for the active season's season_number IS the member's rank
// driver. Server-only (admin client).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'

/**
 * Count the Journeys a member has finished in the active season — the number that
 * drives season rank (rankForCompletion). One `journey_completions` row = one
 * finished Journey (and one Trophy). Returns 0 when there is no active season.
 */
export async function journeysFinishedThisSeason(profileId: string): Promise<number> {
  const season = await getCurrentSeason()
  if (!season) return 0

  const admin = createAdminClient()
  const { count } = await admin
    .from('journey_completions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('season', season.season_number)

  return count ?? 0
}
