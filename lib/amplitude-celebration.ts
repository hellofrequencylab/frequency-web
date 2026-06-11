// Amplitude celebrations (Rewards Economy v2, brief §6).
//
// Two moments, mirroring the member-progress "just unlocked" pattern (ADR-146):
//   * Level-up — MID-TIER: a warm one-time banner on the home feed.
//   * Milestone (1k/5k/…) — the big one: the Award itself is minted permanently
//     by the achievements engine (amplitude-1k / amplitude-5k); the banner takes
//     the gold treatment until the full-screen art lands (design follow-up,
//     GAMIFICATION-AUDIT.md).
//
// Exactly-once: `profiles.meta.amplitudeLevelSeen` stores the highest level the
// member has been celebrated for — call acknowledgeAmplitudeLevel after showing.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { amplitudeLevel, AMPLITUDE_MILESTONES, AMPLITUDE_MILESTONE_LABELS } from '@/lib/amplitude'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface AmplitudeCelebration {
  /** The level just reached (highest unseen). */
  level: number
  amplitude: number
  /** Set when this climb also crossed a milestone total — gold treatment. */
  milestoneLabel: string | null
}

/** The pure decision: celebrate when the derived level exceeds the seen level.
 *  Returns null when there is nothing new. */
export function decideAmplitudeCelebration(
  amplitude: number,
  levelSeen: number,
): AmplitudeCelebration | null {
  const level = amplitudeLevel(amplitude)
  if (level <= levelSeen) return null
  // A milestone celebration fires when the amplitude total sits at or beyond a
  // milestone whose level the member hasn't been celebrated for yet.
  const crossed = AMPLITUDE_MILESTONES.filter(
    (m) => amplitude >= m && amplitudeLevel(m) > levelSeen,
  )
  const top = crossed.length ? crossed[crossed.length - 1] : null
  return {
    level,
    amplitude,
    milestoneLabel: top ? AMPLITUDE_MILESTONE_LABELS[top] ?? null : null,
  }
}

/** A member's pending level-up celebration, or null. Pure read. */
export async function getAmplitudeCelebration(
  profileId: string,
): Promise<AmplitudeCelebration | null> {
  const admin = db()
  const { data: prof } = await admin
    .from('profiles')
    .select('amplitude, meta')
    .eq('id', profileId)
    .maybeSingle()
  if (!prof) return null
  const amplitude = Number((prof as { amplitude: number | null }).amplitude ?? 0)
  const meta = ((prof as { meta: Record<string, unknown> | null }).meta ?? {}) as Record<string, unknown>
  const levelSeen = Number((meta.amplitudeLevelSeen as number | undefined) ?? 0)
  return decideAmplitudeCelebration(amplitude, levelSeen)
}

/** Record the celebrated level (monotonic) so the moment fires exactly once. */
export async function acknowledgeAmplitudeLevel(profileId: string, level: number): Promise<void> {
  const admin = db()
  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = ((prof as { meta: Record<string, unknown> | null } | null)?.meta ?? {}) as Record<string, unknown>
  const seen = Number((meta.amplitudeLevelSeen as number | undefined) ?? 0)
  if (level <= seen) return
  await admin
    .from('profiles')
    .update({ meta: { ...meta, amplitudeLevelSeen: level } })
    .eq('id', profileId)
}
