'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

// Leaderboard opt-out action — a one-tap "hide me from the board" preference.
// Cooperative design: ranking is secondary and should feel opt-in, so a member can
// step off the individual board at any time and still count toward the collective
// goal (the shared total reads from current_season_zaps, which this never touches).
//
// Storage: profiles.meta.leaderboardOptOut (jsonb), the same per-user settings store
// the practice streak already lives in. No migration needed — the meta column exists.
// We read-modify-write the whole meta blob so we never clobber sibling keys. The pure
// read of the flag lives in ./opt-out (so non-action callers don't import a server action).

/** Set the viewer's "hide me from the board" preference. Always keys off the
 *  session profile, never the client, so a member can only change their OWN. */
export async function setLeaderboardVisibility(hidden: boolean): Promise<{ ok: boolean; hidden: boolean }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, hidden }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('meta')
    .eq('id', profileId)
    .maybeSingle()

  const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
  const nextMeta = { ...meta, leaderboardOptOut: hidden }

  await admin.from('profiles').update({ meta: nextMeta }).eq('id', profileId)

  revalidatePath('/crew/leaderboard')
  return { ok: true, hidden }
}
