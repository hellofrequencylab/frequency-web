'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeProfileMeta } from '@/lib/profiles/meta'
import { awardGems } from '@/lib/gems'
import { getProfileChores } from '@/lib/onboarding/profile-chores'

async function callerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export interface ChoresRewardResult {
  awarded: boolean
  amount: number
  /** True when the chores were already rewarded on a prior pass (idempotent). */
  already?: boolean
}

/** Grant the one-time chores-completion reward. Idempotent: gated on the
 *  profiles.meta.chores.rewarded flag so the matriarch only pays once. Uses the
 *  long-dangling `welcome_member` gem action (BACKLOG §C — previously unobtainable). */
export async function claimChoresReward(): Promise<ChoresRewardResult> {
  const profileId = await callerProfileId()
  if (!profileId) return { awarded: false, amount: 0 }

  const chores = await getProfileChores(profileId)
  if (!chores.complete) return { awarded: false, amount: 0 }
  if (chores.rewarded) return { awarded: false, amount: 0, already: true }

  const admin = createAdminClient()

  // Stamp the flag FIRST (merge, never blind-overwrite) so a double-submit can't
  // double-pay — the award below is the side effect, the flag is the guard.
  const { data: row } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (row?.meta ?? {}) as Record<string, unknown>
  const choresMeta = (meta.chores ?? {}) as Record<string, unknown>
  if (choresMeta.rewarded === true) return { awarded: false, amount: 0, already: true }
  // 2026-09-05 (scan2 L6-09): "merge, never blind-overwrite" above now holds at the database: ONLY the
  // `chores` key is merged server-side, and the merge is checked. The flag is the guard for the Gems
  // below, so an unstamped flag pays nothing (it would pay again on the next claim otherwise).
  const { error } = await mergeProfileMeta(admin, profileId, {
    chores: { ...choresMeta, rewarded: true, rewarded_at: new Date().toISOString() },
  })
  if (error) {
    console.error('[claimChoresReward] chores stamp failed, paying nothing', { profileId, error })
    return { awarded: false, amount: 0 }
  }

  const result = await awardGems(profileId, 'welcome_member', undefined, { reason: 'profile_chores' })
  return { awarded: result.awarded, amount: result.amount }
}
