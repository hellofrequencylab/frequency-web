'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { getFounderTasks, type FounderTaskKey } from '@/lib/onboarding/founder-tasks'
import { FOUNDER_REWARD, FOUNDER_TASKS } from '@/lib/onboarding/founder-config'

type ClaimRpc = {
  rpc: (
    fn: 'claim_founder_flags',
    args: { p_profile_id: string; p_tasks: string[]; p_complete: boolean },
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

const FOUNDER_TASK_KEYS = new Set<string>(FOUNDER_TASKS.map((t) => t.key))
function isFounderTaskKey(k: string): k is FounderTaskKey {
  return FOUNDER_TASK_KEYS.has(k)
}

/** What the database says this call claimed. Anything but a well-formed answer claims nothing:
 *  an unknown shape must never read as "pay everything". */
function readClaim(data: unknown): { added: string[]; completing: boolean } {
  const d = (data && typeof data === 'object' ? data : {}) as { added?: unknown; completing?: unknown }
  const added = Array.isArray(d.added) ? d.added.filter((k): k is string => typeof k === 'string') : []
  return { added, completing: d.completing === true }
}

// Reward-on-first-occurrence + the badge (build item 1.4). Reconciliation, not a
// new engine: each first-week task pays a small gem bonus the first time it's seen
// done (tracked in profiles.meta.founder.rewarded), and finishing the set grants
// the 'founders-first-week' badge + a completion bonus exactly once. Idempotent —
// safe to call on every page view; the meta flags are the guard, the awards the
// side effect (flag-first doctrine, matching the chores reward).
//
// 2026-10-05 (SCAN-759): the stamp is a COMPARE-AND-SET, not a merge. The old shape read
// profiles.meta with no lock, decided newlyRewarded from that snapshot, merged the flags and paid:
// two tabs (or five parallel posts of this action) all read rewarded=[] before any stamp landed,
// each merged the same stamp, each succeeded and each paid. claim_founder_flags (migration
// 20270345011800) selects the row FOR UPDATE, stamps only what is not yet stamped and returns
// {added, completing}: the exact set THIS call claimed. The Gems are paid for that set only, so
// the second overlapping call gets added=[] and pays nothing.

// All tunable in lib/onboarding/founder-config.ts (the single edit point).
const PER_TASK_GEMS = FOUNDER_REWARD.perTaskGems
const COMPLETION_BONUS = FOUNDER_REWARD.completionBonus
const BADGE_SLUG = FOUNDER_REWARD.badgeSlug

async function callerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export interface FounderClaimResult {
  newlyRewarded: FounderTaskKey[]
  gemsAwarded: number
  badgeGranted: boolean
}

export async function claimFounderRewards(): Promise<FounderClaimResult> {
  const empty: FounderClaimResult = { newlyRewarded: [], gemsAwarded: 0, badgeGranted: false }
  const profileId = await callerProfileId()
  if (!profileId) return empty

  const tasks = await getFounderTasks(profileId)
  const admin = createAdminClient()

  // The compare-and-set. The RPC post-dates the generated types, so the call is cast (repo
  // convention for not-yet-typed DB objects); it is called inline on the client so `this`
  // survives (scripts/check-detached-client-methods.test.ts).
  const { data, error } = await (admin as unknown as ClaimRpc).rpc('claim_founder_flags', {
    p_profile_id: profileId,
    p_tasks: tasks.tasks.filter((t) => t.done).map((t) => t.key),
    p_complete: tasks.complete,
  })
  if (error) {
    console.error('[claimFounderRewards] founder stamp failed, paying nothing', { profileId, error })
    return empty
  }
  const claimed = readClaim(data)
  const newlyRewarded = claimed.added.filter((k): k is FounderTaskKey => isFounderTaskKey(k))
  const completing = claimed.completing

  let gemsAwarded = 0

  if (newlyRewarded.length) {
    const r = await awardGems(profileId, 'achievement', PER_TASK_GEMS * newlyRewarded.length, {
      reason: 'founder_first_week',
      tasks: newlyRewarded,
    })
    if (r.awarded) gemsAwarded += r.amount
  }

  if (completing) {
    // Grant the badge (best-effort; the user_achievements unique constraint makes a
    // race a harmless no-op) and pay the completion bonus once.
    const { data: ach } = await admin.from('achievements').select('id').eq('slug', BADGE_SLUG).maybeSingle()
    if (ach) {
      await admin.from('user_achievements').insert({ profile_id: profileId, achievement_id: ach.id })
    }
    const r = await awardGems(profileId, 'achievement', COMPLETION_BONUS, { reason: 'founder_first_week_complete' })
    if (r.awarded) gemsAwarded += r.amount
  }

  return { newlyRewarded, gemsAwarded, badgeGranted: completing }
}
