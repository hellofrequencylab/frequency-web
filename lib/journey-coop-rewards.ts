// Co-op reward firing + the shared meter (ADR-199; docs/JOURNEYS.md §9.1). The pure detection
// lives in lib/journey-coop.ts; this is the server layer that gathers the DB inputs, fires the
// weekly co-op bonus + the shared completion trophy (claim-then-pay via reward_grants, mirroring
// lib/journey-grants.ts), and powers the shared-progress meter on the Journey page.
//
// Co-op is scoped to OFFICIAL season Journeys (those with a resolvable season anchor) — that is
// where a shared 13-week window is well defined. Server-only; best-effort (the log hot path and
// the page both guard the call); never throws.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COOP_MIN_MEMBERS,
  COOP_WEEKLY_ZAPS,
  COOP_COMPLETE_GEMS,
  coopKey,
  coopCompletionKey,
} from '@/lib/journey-coop'
import { weeklyTargetFromCadence } from '@/lib/journey-plans'
import {
  seasonWeekBucket,
  currentSeasonWeek,
  qualifyingWeeks,
  SEASON_WEEKS,
  DEFAULT_TARGET_WEEKS,
} from '@/lib/journey-quest-clock'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const sevenAgoStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 6) // inclusive 7-day window: today + 6 prior
  return d.toISOString().slice(0, 10)
}

/** One Co-op (≥3 circle-co-members on an official plan) with each member's live state. */
interface CoopStat {
  circleId: string
  planId: string
  season: number
  anchorStart: string
  memberIds: string[]
  /** Members on track on every step this week. */
  inRhythm: Set<string>
  /** Members who have completed the Journey (qualifying weeks ≥ target). */
  completed: Set<string>
  targetWeeks: number
  completionGems: number
}

/**
 * Gather the viewer's Co-ops with each member's rhythm-this-week + completion. `planIds` scopes
 * the work (the member's official plans for firing, or `[planId]` for the meter). Returns `[]`
 * when the member is in no qualifying Co-op. Bulk queries only — no per-member round trips.
 */
async function computeCoops(
  admin: SupabaseClient,
  profileId: string,
  planIds?: string[],
): Promise<CoopStat[]> {
  // 1. My active circles + every active member of them (includes me).
  const { data: myMem } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  const myCircleIds = [...new Set(((myMem ?? []) as { circle_id: string }[]).map((m) => m.circle_id))]
  if (myCircleIds.length === 0) return []

  const { data: allMem } = await admin
    .from('memberships')
    .select('circle_id, profile_id')
    .in('circle_id', myCircleIds)
    .eq('status', 'active')
  const membersByCircle = new Map<string, Set<string>>()
  const everyMember = new Set<string>()
  for (const m of (allMem ?? []) as { circle_id: string; profile_id: string }[]) {
    const s = membersByCircle.get(m.circle_id) ?? new Set<string>()
    s.add(m.profile_id)
    membersByCircle.set(m.circle_id, s)
    everyMember.add(m.profile_id)
  }

  // 2. Candidate plans — the member's active OFFICIAL adoptions (quest_id set), filtered to planIds.
  const { data: myPlanRows } = await admin
    .from('journey_plan_adoptions')
    .select('plan:journey_plans(id, quest_id, target_weeks, min_practices_per_day, completion_gems)')
    .eq('profile_id', profileId)
    .eq('active', true)
  type Plan = {
    id: string
    quest_id: string | null
    target_weeks: number | null
    min_practices_per_day: number | null
    completion_gems: number | null
  }
  let plans = ((myPlanRows ?? []) as unknown as { plan: Plan | null }[])
    .map((r) => r.plan)
    .filter((p): p is Plan => !!p && !!p.quest_id)
  if (planIds) plans = plans.filter((p) => planIds.includes(p.id))
  if (plans.length === 0) return []
  const planById = new Map(plans.map((p) => [p.id, p]))
  const planIdList = plans.map((p) => p.id)

  // 3. Season anchors (quest → season → starts_at).
  const seasonByQuest = new Map<string, number>()
  const startBySeason = new Map<number, string>()
  const questIds = [...new Set(plans.map((p) => p.quest_id).filter((q): q is string => !!q))]
  if (questIds.length) {
    const { data: qs } = await admin.from('quests').select('id, season').in('id', questIds)
    for (const q of (qs ?? []) as { id: string; season: number | null }[]) {
      if (q.season != null) seasonByQuest.set(q.id, q.season)
    }
    const seasonNos = [...new Set([...seasonByQuest.values()])]
    if (seasonNos.length) {
      const { data: ss } = await admin.from('seasons').select('season_number, starts_at').in('season_number', seasonNos)
      for (const s of (ss ?? []) as { season_number: number; starts_at: string | null }[]) {
        if (s.starts_at) startBySeason.set(s.season_number, s.starts_at.slice(0, 10))
      }
    }
  }

  // 4. Active adopters of these plans who are in my circles.
  const { data: adRows } = await admin
    .from('journey_plan_adoptions')
    .select('plan_id, profile_id')
    .in('plan_id', planIdList)
    .eq('active', true)
    .in('profile_id', [...everyMember])
  const adoptersByPlan = new Map<string, Set<string>>()
  for (const r of (adRows ?? []) as { plan_id: string; profile_id: string }[]) {
    const s = adoptersByPlan.get(r.plan_id) ?? new Set<string>()
    s.add(r.profile_id)
    adoptersByPlan.set(r.plan_id, s)
  }

  // 5. Form Co-ops: (circle, plan) with ≥ COOP_MIN_MEMBERS shared active members.
  const coops: { circleId: string; planId: string; memberIds: string[] }[] = []
  for (const [circleId, members] of membersByCircle) {
    for (const planId of planIdList) {
      const adopters = adoptersByPlan.get(planId)
      if (!adopters) continue
      const shared = [...members].filter((id) => adopters.has(id))
      if (shared.length >= COOP_MIN_MEMBERS) coops.push({ circleId, planId, memberIds: shared })
    }
  }
  if (coops.length === 0) return []

  // 6. Plan items (practice_id + cadence target) for the coop plans.
  const coopPlanIds = [...new Set(coops.map((c) => c.planId))]
  const { data: itemRows } = await admin
    .from('journey_plan_items')
    .select('plan_id, practice_id, cadence, practice:practices(cadence)')
    .in('plan_id', coopPlanIds)
  type Item = { plan_id: string; practice_id: string; cadence: string | null; practice: { cadence: string | null } | null }
  const itemsByPlan = new Map<string, { practiceId: string; target: number }[]>()
  for (const it of (itemRows ?? []) as unknown as Item[]) {
    const target = weeklyTargetFromCadence(it.cadence ?? it.practice?.cadence ?? null)
    const arr = itemsByPlan.get(it.plan_id) ?? []
    arr.push({ practiceId: it.practice_id, target })
    itemsByPlan.set(it.plan_id, arr)
  }

  // 7. One bulk practice_logs read for every coop member + practice, since the earliest anchor.
  const allMembers = [...new Set(coops.flatMap((c) => c.memberIds))]
  const allPractices = [...new Set([...itemsByPlan.values()].flat().map((i) => i.practiceId))]
  let minDate = sevenAgoStr()
  for (const planId of coopPlanIds) {
    const seasonNo = seasonByQuest.get(planById.get(planId)!.quest_id!)
    const start = seasonNo != null ? startBySeason.get(seasonNo) : undefined
    if (start && start < minDate) minDate = start
  }
  const logsByMember = new Map<string, { practiceId: string; day: string }[]>()
  if (allMembers.length && allPractices.length) {
    const { data: logRows } = await admin
      .from('practice_logs')
      .select('profile_id, practice_id, logged_for')
      .in('profile_id', allMembers)
      .in('practice_id', allPractices)
      .gte('logged_for', minDate)
    for (const r of (logRows ?? []) as { profile_id: string; practice_id: string | null; logged_for: string }[]) {
      if (!r.practice_id) continue
      const arr = logsByMember.get(r.profile_id) ?? []
      arr.push({ practiceId: r.practice_id, day: r.logged_for })
      logsByMember.set(r.profile_id, arr)
    }
  }

  // 8. Per Co-op, compute each member's rhythm-this-week + completion.
  const wk = sevenAgoStr()
  const out: CoopStat[] = []
  for (const c of coops) {
    const plan = planById.get(c.planId)!
    const seasonNo = seasonByQuest.get(plan.quest_id!)
    const anchorStart = seasonNo != null ? startBySeason.get(seasonNo) : undefined
    if (seasonNo == null || !anchorStart) continue // a Co-op needs a season anchor
    const items = itemsByPlan.get(c.planId) ?? []
    const planPractices = new Set(items.map((i) => i.practiceId))
    const minPerDay = plan.min_practices_per_day ?? 1
    const targetWeeks = plan.target_weeks ?? DEFAULT_TARGET_WEEKS
    const inRhythm = new Set<string>()
    const completed = new Set<string>()

    for (const mId of c.memberIds) {
      const logs = (logsByMember.get(mId) ?? []).filter((l) => planPractices.has(l.practiceId))
      const daysByPractice = new Map<string, Set<string>>() // practice → distinct days (last 7)
      const practicesByDay = new Map<string, Set<string>>() // day → distinct practices (season)
      for (const l of logs) {
        if (l.day >= wk) {
          const s = daysByPractice.get(l.practiceId) ?? new Set<string>()
          s.add(l.day)
          daysByPractice.set(l.practiceId, s)
        }
        if (l.day >= anchorStart) {
          const s = practicesByDay.get(l.day) ?? new Set<string>()
          s.add(l.practiceId)
          practicesByDay.set(l.day, s)
        }
      }
      const allMet = items.length > 0 && items.every((i) => (daysByPractice.get(i.practiceId)?.size ?? 0) >= i.target)
      if (allMet) inRhythm.add(mId)
      const qDays = [...practicesByDay.entries()].filter(([, s]) => s.size >= minPerDay).map(([d]) => d)
      if (qualifyingWeeks(qDays, anchorStart) >= targetWeeks) completed.add(mId)
    }

    out.push({
      circleId: c.circleId,
      planId: c.planId,
      season: seasonNo,
      anchorStart,
      memberIds: c.memberIds,
      inRhythm,
      completed,
      targetWeeks,
      completionGems: plan.completion_gems ?? 30,
    })
  }
  return out
}

/** Claim-then-pay one reward to one member (mirrors lib/journey-grants.ts). */
async function grantToMember(
  admin: SupabaseClient,
  key: string,
  kind: 'zaps' | 'gems',
  amount: number,
  label: string,
  profileId: string,
): Promise<boolean> {
  const { error } = await admin.from('reward_grants').insert({
    rule_key: key,
    profile_id: profileId,
    reward_kind: kind,
    amount,
    detail: label,
  })
  if (error) return false // unique (rule_key, profile_id) = already granted / lost the race
  const ledger = kind === 'gems' ? 'gem_transactions' : 'zap_transactions'
  await admin.from(ledger).insert({
    profile_id: profileId,
    action_type: kind === 'gems' ? 'journey_reward' : 'journey_bonus',
    amount,
    metadata: { rule: key, label },
  })
  return true
}

export interface CoopRewardResult {
  bonuses: { label: string; kind: 'zaps' | 'gems'; amount: number }[]
  zaps: number
  gems: number
}

/**
 * Fire the Co-op rewards a fresh log may have unlocked. For each Co-op the member is in: when
 * ≥3 members hit rhythm this week, every member earns the weekly Co-op bonus (once per coop-week);
 * when ≥3 members have completed the Journey, every member earns the shared completion trophy
 * (once per coop-season). Returns what the *logging* member newly received (for the toast).
 */
export async function fireCoopRewardsForLog(profileId: string, day: string): Promise<CoopRewardResult> {
  const admin = db()
  const result: CoopRewardResult = { bonuses: [], zaps: 0, gems: 0 }
  let coops: CoopStat[]
  try {
    coops = await computeCoops(admin, profileId)
  } catch {
    return result
  }
  if (coops.length === 0) return result

  for (const c of coops) {
    // Weekly Co-op bonus — ≥3 in rhythm this week → every member, once per coop-week.
    const bucket = seasonWeekBucket(day, c.anchorStart)
    if (bucket !== null && c.inRhythm.size >= COOP_MIN_MEMBERS) {
      const key = coopKey(c.circleId, c.planId, c.season, bucket)
      for (const mId of c.memberIds) {
        const ok = await grantToMember(admin, key, 'zaps', COOP_WEEKLY_ZAPS, 'Co-op rhythm', mId)
        if (ok && mId === profileId) {
          result.bonuses.push({ label: 'Co-op rhythm', kind: 'zaps', amount: COOP_WEEKLY_ZAPS })
          result.zaps += COOP_WEEKLY_ZAPS
        }
      }
    }
    // Shared completion trophy — ≥3 completed → every member, once per coop-season.
    if (c.completed.size >= COOP_MIN_MEMBERS) {
      const key = coopCompletionKey(c.circleId, c.planId, c.season)
      for (const mId of c.memberIds) {
        const ok = await grantToMember(admin, key, 'gems', COOP_COMPLETE_GEMS, 'Co-op complete', mId)
        if (ok && mId === profileId) {
          result.bonuses.push({ label: 'Co-op complete', kind: 'gems', amount: COOP_COMPLETE_GEMS })
          result.gems += COOP_COMPLETE_GEMS
        }
      }
    }
  }
  return result
}

/** The shared-meter read for the Journey page (one plan). Null when the viewer is in no Co-op
 *  for this plan (the page falls back to the lightweight companions strip). */
export interface CoopMeterData {
  size: number
  inRhythm: number
  completed: number
  targetWeeks: number
  weeksLeft: number | null
}

export async function getCoopMeter(profileId: string, planId: string): Promise<CoopMeterData | null> {
  const admin = db()
  let coops: CoopStat[]
  try {
    coops = await computeCoops(admin, profileId, [planId])
  } catch {
    return null
  }
  // The largest Co-op the viewer belongs to for this plan.
  const c = coops
    .filter((x) => x.memberIds.includes(profileId))
    .sort((a, b) => b.memberIds.length - a.memberIds.length)[0]
  if (!c) return null
  const sw = currentSeasonWeek(todayStr(), c.anchorStart)
  return {
    size: c.memberIds.length,
    inRhythm: c.inRhythm.size,
    completed: c.completed.size,
    targetWeeks: c.targetWeeks,
    weeksLeft: sw != null ? Math.max(0, SEASON_WEEKS - sw) : null,
  }
}
