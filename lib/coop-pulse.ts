// Co-op Pulse (+3⚡) — Rewards Economy v2.
//
// Nightly: for each (circle, journey, date), if 3+ ACTIVE members of the same
// circle each logged ≥1 practice belonging to the same adopted Journey that day,
// every one of them is credited +3⚡ (live amount from zap_config co_op_pulse).
// Idempotency key per the brief: (profile, journey, date) — a member in two
// qualifying circles for the same journey/date is paid once. Claim-then-pay via
// reward_grants rule `coop.pulse:<planId>:<date>` (the table adds profile_id).
//
// Derived from practice_logs × journey_plan_adoptions × memberships — no new
// counters. Carrier Wave (10 Co-op Pulse days) and Co-op Synchrony (a circle
// accumulates 30 pulse days) ride the same grants.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardZapsForAction } from '@/lib/zaps'
import { grantStoreItem } from '@/lib/awards/cosmetics'

function db(): SupabaseClient {
  return createAdminClient()
}

export const COOP_SYNCHRONY_DAYS = 30
export const CARRIER_WAVE_DAYS = 10

export interface CoopPulseRun {
  date: string
  pulses: number
  circles: number
}

export function pulseKey(planId: string, date: string): string {
  return `coop.pulse:${planId}:${date}`
}

/** Run the pulse for one date (default: yesterday UTC — the completed day). */
export async function runCoopPulse(date?: string): Promise<CoopPulseRun> {
  const admin = db()
  const day = date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const result: CoopPulseRun = { date: day, pulses: 0, circles: 0 }

  // 1. Who logged what that day.
  const { data: logRows } = await admin
    .from('practice_logs')
    .select('profile_id, practice_id')
    .eq('logged_for', day)
    .not('practice_id', 'is', null)
  const logs = (logRows ?? []) as { profile_id: string; practice_id: string }[]
  if (logs.length === 0) return result
  const loggers = [...new Set(logs.map((l) => l.profile_id))]
  const practiceIds = [...new Set(logs.map((l) => l.practice_id))]

  // 2. Which journeys those practices belong to, and who has adopted them.
  const { data: itemRows } = await admin
    .from('journey_plan_items')
    .select('plan_id, practice_id')
    .in('practice_id', practiceIds)
  const plansByPractice = new Map<string, Set<string>>()
  for (const it of (itemRows ?? []) as { plan_id: string; practice_id: string }[]) {
    const set = plansByPractice.get(it.practice_id) ?? new Set<string>()
    set.add(it.plan_id)
    plansByPractice.set(it.practice_id, set)
  }
  if (plansByPractice.size === 0) return result

  const { data: adoptRows } = await admin
    .from('journey_plan_adoptions')
    .select('plan_id, profile_id')
    .eq('active', true)
    .in('profile_id', loggers)
  const adopted = new Set(
    ((adoptRows ?? []) as { plan_id: string; profile_id: string }[]).map(
      (a) => `${a.profile_id}:${a.plan_id}`,
    ),
  )

  // profile → journeys they logged toward that day (must have adopted the plan).
  const journeysByProfile = new Map<string, Set<string>>()
  for (const l of logs) {
    for (const planId of plansByPractice.get(l.practice_id) ?? []) {
      if (!adopted.has(`${l.profile_id}:${planId}`)) continue
      const set = journeysByProfile.get(l.profile_id) ?? new Set<string>()
      set.add(planId)
      journeysByProfile.set(l.profile_id, set)
    }
  }
  if (journeysByProfile.size === 0) return result

  // 3. Same-circle grouping.
  const { data: memberRows } = await admin
    .from('memberships')
    .select('circle_id, profile_id')
    .eq('status', 'active')
    .in('profile_id', [...journeysByProfile.keys()])
  const members = (memberRows ?? []) as { circle_id: string; profile_id: string }[]

  // (circle, journey) → members who logged that journey that day.
  const groups = new Map<string, Set<string>>()
  for (const m of members) {
    for (const planId of journeysByProfile.get(m.profile_id) ?? []) {
      const key = `${m.circle_id}|${planId}`
      const set = groups.get(key) ?? new Set<string>()
      set.add(m.profile_id)
      groups.set(key, set)
    }
  }

  // 4. Pay each qualifying member once per (journey, date), claim-then-pay.
  const pulsedCircles = new Set<string>()
  for (const [key, profileSet] of groups) {
    if (profileSet.size < 3) continue
    const [circleId, planId] = key.split('|')
    pulsedCircles.add(circleId)
    for (const profileId of profileSet) {
      const { error } = await admin.from('reward_grants').insert({
        rule_key: pulseKey(planId, day),
        profile_id: profileId,
        reward_kind: 'zaps',
        amount: 0, // ledger row below carries the live amount
        detail: `circle:${circleId}`,
      })
      if (error) continue // already paid for this (journey, date) — possibly via another circle
      await awardZapsForAction(profileId, 'co_op_pulse')
      result.pulses++
    }
  }
  result.circles = pulsedCircles.size
  if (result.pulses === 0) return result

  // 5. Carrier Wave — 10 distinct Co-op Pulse days per member (secret award).
  try {
    const { unlockCarrierWaveIfEarned } = await import('@/lib/awards/secret')
    for (const [, profileSet] of groups) {
      if (profileSet.size < 3) continue
      for (const profileId of profileSet) await unlockCarrierWaveIfEarned(profileId)
    }
  } catch {
    // a badge check never breaks the pulse run
  }

  // 6. Co-op Synchrony — a circle accumulates 30 pulse days (permanent badge for
  //    the circle + its current active members).
  for (const circleId of pulsedCircles) {
    const { data: circleGrants } = await admin
      .from('reward_grants')
      .select('rule_key')
      .like('rule_key', 'coop.pulse:%')
      .eq('detail', `circle:${circleId}`)
    const days = new Set(
      ((circleGrants ?? []) as { rule_key: string }[]).map((g) => g.rule_key.split(':')[2]),
    )
    if (days.size < COOP_SYNCHRONY_DAYS) continue

    const { error } = await admin.from('circle_awards').insert({
      circle_id: circleId,
      award_slug: 'coop_synchrony',
      season: null,
    })
    if (error) continue // unique → already awarded

    const { data: circleMembers } = await admin
      .from('memberships')
      .select('profile_id')
      .eq('circle_id', circleId)
      .eq('status', 'active')
    for (const m of (circleMembers ?? []) as { profile_id: string }[]) {
      await grantStoreItem(m.profile_id, 'coop-synchrony-badge')
    }
  }

  return result
}
