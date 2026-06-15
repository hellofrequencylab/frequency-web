// Journey completion reads for the Quest rank system.
//
// Rank = how many Journeys a member finishes this season (ADR-Quest completion model).
// Completions are tracked via journey_enrollments.completed_at; a row is "finished
// this season" when completed_at falls within the active season's date window.
// Server-only (admin client).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'

/**
 * Count the Journeys a member has finished in the active season. A Journey is
 * finished when its journey_enrollments.completed_at is non-null and falls within
 * the active season's starts_at…now window. Returns 0 when there is no active
 * season or the member has no completions.
 */
export async function journeysFinishedThisSeason(profileId: string): Promise<number> {
  const admin = createAdminClient()
  const season = await getCurrentSeason()

  let query = admin
    .from('journey_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .not('completed_at', 'is', null)

  // Constrain to the active season window when one is running.
  if (season?.starts_at) {
    query = query.gte('completed_at', season.starts_at)
  }
  if (season?.ends_at) {
    query = query.lte('completed_at', season.ends_at)
  }

  const { count } = await query
  return count ?? 0
}
