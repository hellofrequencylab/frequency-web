// Side Quests (ADR-300 Part 3): reward-only, badge-granting missions that do NOT count toward the
// four Pillars. A Side Quest is an `achievements` row flagged `is_side_quest` with MANUAL criteria
// (so the passive auto-evaluator in lib/achievements.ts skips it). Members claim them on the
// /crew/side-quests board; claiming unlocks the badge (a `user_achievements` row — the unique
// (profile_id, achievement_id) insert is the idempotency lock) and pays the Zaps reward once.
// Server-only. The `is_side_quest` column is new (not yet in the generated types), so this module
// uses the untyped admin handle, the repo convention for not-yet-regenerated columns (see
// lib/seasons.ts). Drop the cast after `supabase gen types`.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardZaps } from '@/lib/zaps'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface SideQuest {
  id: string
  slug: string
  name: string
  description: string | null
  /** A lucide icon name (achievements.icon). */
  icon: string
  tier: string
  zapsReward: number
  /** True once this member has finished (claimed) it. */
  claimed: boolean
}

/** Every Side Quest, with this member's claimed state (claimed=false for a visitor). */
export async function listSideQuests(profileId: string | null): Promise<SideQuest[]> {
  const admin = db()
  const [questsRes, claimedRes] = await Promise.all([
    admin
      .from('achievements')
      .select('id, slug, name, description, icon, tier, zaps_reward')
      .eq('is_side_quest', true)
      .order('sort_order', { ascending: true }),
    profileId
      ? admin.from('user_achievements').select('achievement_id').eq('profile_id', profileId)
      : Promise.resolve({ data: [] as { achievement_id: string }[] }),
  ])

  const claimed = new Set(((claimedRes.data ?? []) as { achievement_id: string }[]).map((c) => c.achievement_id))
  const rows = (questsRes.data ?? []) as Array<{
    id: string; slug: string; name: string; description: string | null; icon: string; tier: string; zaps_reward: number
  }>
  return rows.map((q) => ({
    id: q.id,
    slug: q.slug,
    name: q.name,
    description: q.description,
    icon: q.icon || 'award',
    tier: q.tier,
    zapsReward: q.zaps_reward ?? 0,
    claimed: claimed.has(q.id),
  }))
}

export interface ClaimResult {
  ok: boolean
  /** True if the member had already finished this quest. */
  alreadyClaimed?: boolean
  /** Zaps newly awarded (0 if none / already claimed). */
  zaps?: number
  name?: string
}

/** Finish (claim) a Side Quest: unlock its badge and pay the Zaps reward EXACTLY ONCE. The unique
 *  (profile_id, achievement_id) insert is the lock, so a repeated claim never double-pays. */
export async function claimSideQuest(profileId: string, achievementId: string): Promise<ClaimResult> {
  const admin = db()
  const { data } = await admin
    .from('achievements')
    .select('id, name, zaps_reward, is_side_quest')
    .eq('id', achievementId)
    .maybeSingle()
  const q = data as { id: string; name: string; zaps_reward: number; is_side_quest: boolean } | null
  if (!q || !q.is_side_quest) return { ok: false }

  const { error } = await admin.from('user_achievements').insert({ profile_id: profileId, achievement_id: achievementId })
  if (error) return { ok: false, alreadyClaimed: true } // already claimed / lost the race

  let zaps = 0
  if (q.zaps_reward > 0) {
    const res = await awardZaps(profileId, q.zaps_reward, { actionType: 'side_quest', metadata: { achievement: achievementId, name: q.name } })
    zaps = res.awarded ? res.amount : 0
  }
  return { ok: true, zaps, name: q.name }
}
