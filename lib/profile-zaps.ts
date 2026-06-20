// Profile zap-sum reader (HARD-05, A-PLUS §6). A member's lifetime Zaps earned
// from crew completions, surfaced on their public profile as the Spark milestone
// and the rank-ladder driver.
//
// One aggregate, not a tally: this calls the profile_zap_total SECURITY DEFINER
// function (one sum() query) instead of fetching every crew_completions row and
// reducing zaps_earned in app code. Same total: sum over the member's rows, 0 for
// a member with no completions (the RPC coalesces; zaps_earned is NOT NULL).
//
// Server-only. The read goes through the service-role admin client behind app-code
// authz, matching lib/frequency-signature-data.ts.

import { createAdminClient } from '@/lib/supabase/admin'

/** A member's lifetime Zaps earned from crew completions, via one SQL aggregate. */
export async function getProfileZapTotal(profileId: string): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('profile_zap_total', { _profile: profileId })
  if (error) {
    console.error('[getProfileZapTotal]', error.message)
    return 0
  }
  return Number(data ?? 0)
}
