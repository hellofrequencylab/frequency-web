'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { getConnectionSettings } from '@/lib/connections/connection-settings'

// Welcomes (ADR-186, P3b): greeting a newcomer in your circles earns reward_welcome
// gems once. The unique (welcomer, newcomer) constraint is the idempotency guard —
// insert-first, then pay only if the insert was new (no double reward, no gaming a
// member you've already welcomed). Validates the target is genuinely a recent
// newcomer who shares one of your circles, so it can't be farmed on strangers.

const WINDOW_DAYS = 14

export interface WelcomeTarget {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  joinedAt: string | null
  sharedCircles: number
}

/** Newcomers in the caller's circles they haven't welcomed yet (authed RPC). */
export async function getWelcomeTargets(limit = 12): Promise<WelcomeTarget[]> {
  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('welcome_targets', { _days: WINDOW_DAYS, _limit: limit })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    profileId: String(r.profile_id),
    displayName: String(r.display_name ?? ''),
    handle: String(r.handle ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    joinedAt: (r.joined_at as string | null) ?? null,
    sharedCircles: Number(r.shared_circles ?? 0),
  }))
}

export interface WelcomeResult {
  awarded: boolean
  gems: number
  error: string | null
}

/** Record that the caller welcomed a newcomer, and pay reward_welcome once. */
export async function recordWelcome(newcomerId: string): Promise<WelcomeResult> {
  const me = await getCallerProfile()
  if (!me) return { awarded: false, gems: 0, error: 'Sign in first.' }
  if (newcomerId === me.id) return { awarded: false, gems: 0, error: 'You can’t welcome yourself.' }

  const db = createAdminClient()

  // Validate: a genuine recent newcomer who shares one of my active circles.
  const { data: target } = await db
    .from('profiles')
    .select('id, created_at')
    .eq('id', newcomerId)
    .maybeSingle()
  const createdAt = (target as { created_at?: string } | null)?.created_at
  if (!createdAt || new Date(createdAt).getTime() < Date.now() - WINDOW_DAYS * 86400000) {
    return { awarded: false, gems: 0, error: 'That member isn’t a recent newcomer.' }
  }

  // Must actually share an active circle with the newcomer — mirrors welcome_targets,
  // so the reward can't be farmed on strangers across the whole platform.
  const { data: theirCircles } = await db
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', newcomerId)
    .eq('status', 'active')
  const circleIds = (theirCircles ?? []).map((r) => (r as { circle_id: string }).circle_id)
  if (circleIds.length === 0) {
    return { awarded: false, gems: 0, error: 'You don’t share a circle with them.' }
  }
  const { count: shared } = await db
    .from('memberships')
    .select('circle_id', { count: 'exact', head: true })
    .eq('profile_id', me.id)
    .eq('status', 'active')
    .in('circle_id', circleIds)
  if (!shared) {
    return { awarded: false, gems: 0, error: 'You don’t share a circle with them.' }
  }

  // Insert-first; the unique constraint makes a repeat a harmless no-op (already welcomed).
  const { error: insErr } = await db
    .from('welcomes')
    .insert({ welcomer_id: me.id, newcomer_id: newcomerId })
  if (insErr) {
    // Duplicate = already welcomed → not an error, just no new reward.
    if (/duplicate|unique/i.test(insErr.message)) return { awarded: false, gems: 0, error: null }
    return { awarded: false, gems: 0, error: insErr.message }
  }

  const settings = await getConnectionSettings()
  const r = await awardGems(me.id, 'achievement', settings.rewardWelcome, {
    reason: 'welcome',
    newcomer: newcomerId,
  })
  revalidatePath('/friends')
  revalidatePath('/network')
  return { awarded: r.awarded, gems: r.amount, error: null }
}
