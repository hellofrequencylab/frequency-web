'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { getFounderTasks, type FounderTaskKey } from '@/lib/onboarding/founder-tasks'

// Reward-on-first-occurrence + the badge (build item 1.4). Reconciliation, not a
// new engine: each first-week task pays a small gem bonus the first time it's seen
// done (tracked in profiles.meta.founder.rewarded), and finishing the set grants
// the 'founders-first-week' badge + a completion bonus exactly once. Idempotent —
// safe to call on every page view; the meta flags are the guard, the awards the
// side effect (flag-first doctrine, matching the chores reward).

const PER_TASK_GEMS = 5
const COMPLETION_BONUS = 25
const BADGE_SLUG = 'founders-first-week'

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

  const { data: row } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (row?.meta ?? {}) as Record<string, unknown>
  const founder = (meta.founder ?? {}) as { rewarded?: FounderTaskKey[]; badge?: boolean }
  const rewarded = new Set<FounderTaskKey>(founder.rewarded ?? [])

  const newlyRewarded = tasks.tasks.filter((t) => t.done && !rewarded.has(t.key)).map((t) => t.key)
  newlyRewarded.forEach((k) => rewarded.add(k))

  const completing = tasks.complete && !founder.badge

  // Stamp the flags FIRST so a double-call can't double-pay; worst case we miss a
  // reward rather than grant it twice.
  await admin
    .from('profiles')
    .update({ meta: { ...meta, founder: { rewarded: [...rewarded], badge: !!founder.badge || tasks.complete } } })
    .eq('id', profileId)

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
