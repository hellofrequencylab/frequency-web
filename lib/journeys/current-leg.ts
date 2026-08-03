// Journeys v2 — the member's CURRENT LEG practice ids, for On Air (ADR-304 follow-up). On Air
// shows the practices a member should be doing RIGHT NOW: the current drip phase of each Journey
// they are actively enrolled in (not the whole Journey). Pure reads on the admin handle; it reuses
// the same tree + drip schedule the learn player uses, so the "leg" matches exactly what is
// unlocked there. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import { buildJourneyTree, type BlockRow } from './tree'
import { unlockedPhaseCount } from './schedule'
import { getMemberRunForPlan, getSoloEnrollmentStart } from './runs'

const BLOCK_COLS = 'id, parent_id, block_type, sort_order, title, required, est_minutes, practice_id'

function toBlock(r: Record<string, unknown>): BlockRow {
  return {
    id: String(r.id),
    parent_id: (r.parent_id as string) ?? null,
    block_type: (r.block_type as string) ?? 'practice',
    sort_order: Number(r.sort_order ?? 0),
    title: (r.title as string) ?? null,
    required: (r.required as boolean) ?? true,
    est_minutes: (r.est_minutes as number) ?? null,
    practice_id: (r.practice_id as string) || null,
  }
}

/** One enrolled Journey's current leg, for the On Air chip: which week of which Journey is
 *  driving the timer list right now. `week` is 1-based; `weeks` is the phase count. */
export interface CurrentLegContext {
  planId: string
  title: string
  /** 1-based current week, or null for a no-drip Journey where EVERY week is open at once
   *  (the chip must not claim "Week 1" over a list carrying all the weeks). */
  week: number | null
  weeks: number
}

export interface CurrentLegResult {
  practiceIds: string[]
  /** One context per contributing Journey (a member can be mid-leg in several at once). */
  legs: CurrentLegContext[]
}

/** The practice ids in the member's CURRENT leg — the latest unlocked drip phase — across every
 *  Journey they are actively enrolled in, de-duped, plus the per-Journey week context for the
 *  On Air chip. A Journey with no drip (interval 0) or no resolvable anchor has one open leg:
 *  all of its practices. A COMPLETED enrollment (journey_enrollments.completed_at set, stamped
 *  by tryCompleteJourney) releases its leg — finishing a Journey hands On Air back to the
 *  member's own practices instead of pinning the final week forever. Returns empty when
 *  enrolled in nothing. */
export async function getCurrentLeg(profileId: string): Promise<CurrentLegResult> {
  const admin = createAdminClient()
  const { data: adoptions } = await admin
    .from('journey_plan_adoptions')
    .select('plan_id')
    .eq('profile_id', profileId)
    .eq('active', true)
  let planIds = [...new Set(((adoptions ?? []) as { plan_id: string }[]).map((a) => a.plan_id))]
  if (!planIds.length) return { practiceIds: [], legs: [] }

  // Release finished Journeys: a plan no longer contributes a leg once every enrollment the
  // member holds on it is RESOLVED — stamped completed, or belonging to a Run that is no
  // longer active (a host cancelling a Run must not pin every member's On Air list until each
  // finds "Leave this Journey"). An un-stamped solo/live-run enrollment keeps the leg — fail
  // toward showing the member their journey work, never toward hiding it.
  const { data: enrollRows } = await admin
    .from('journey_enrollments')
    .select('plan_id, run_id, completed_at')
    .eq('profile_id', profileId)
    .in('plan_id', planIds)
  const enrollments = (enrollRows ?? []) as { plan_id: string; run_id: string | null; completed_at: string | null }[]
  const runIds = [...new Set(enrollments.map((e) => e.run_id).filter((r): r is string => !!r))]
  const endedRuns = new Set<string>()
  if (runIds.length) {
    const { data: runRows } = await admin.from('journey_runs').select('id, status').in('id', runIds)
    for (const r of (runRows ?? []) as { id: string; status: string | null }[]) {
      if (r.status && r.status !== 'active') endedRuns.add(r.id)
    }
  }
  const resolved = (e: { run_id: string | null; completed_at: string | null }) =>
    e.completed_at != null || (e.run_id != null && endedRuns.has(e.run_id))
  const donePlanIds = new Set(
    planIds.filter((pid) => {
      const mine = enrollments.filter((e) => e.plan_id === pid)
      return mine.length > 0 && mine.every(resolved)
    }),
  )
  planIds = planIds.filter((pid) => !donePlanIds.has(pid))
  if (!planIds.length) return { practiceIds: [], legs: [] }

  const out = new Set<string>()
  const legs: CurrentLegContext[] = []
  await Promise.all(
    planIds.map(async (planId) => {
      const [{ data: items }, { data: planRow }] = await Promise.all([
        admin.from('journey_plan_items').select(BLOCK_COLS).eq('plan_id', planId),
        admin.from('journey_plans').select('title, drip_interval_days').eq('id', planId).maybeSingle(),
      ])
      const blocks = ((items ?? []) as Record<string, unknown>[]).map(toBlock)
      const { phases } = buildJourneyTree(blocks, [])
      if (!phases.length) return

      // The drip anchor: the Run's start (cohort) or the member's solo enrollment start.
      const run = await getMemberRunForPlan(profileId, planId)
      const anchorStart = run ? run.startedAt : await getSoloEnrollmentStart(profileId, planId)
      const drip = run
        ? run.dripIntervalDays
        : Number((planRow as { drip_interval_days: number | null } | null)?.drip_interval_days ?? 7)

      // No anchor or no drip → the whole Journey is one open leg (week null: the chip must not
      // claim "Week 1" over a list carrying every week). Otherwise the current leg is the
      // latest unlocked phase (1-based count → last index), matching the player's lock schedule.
      const week = !anchorStart || drip <= 0 ? null : unlockedPhaseCount(new Date(anchorStart), drip, phases.length)
      const legPhases = week === null ? phases : [phases[week - 1]]

      let contributed = false
      for (const phase of legPhases) {
        if (!phase) continue
        for (const m of phase.modules)
          for (const l of m.lessons)
            if (l.practiceId) {
              out.add(l.practiceId)
              contributed = true
            }
      }
      if (contributed) {
        legs.push({
          planId,
          title: String((planRow as { title: string | null } | null)?.title ?? 'Journey'),
          week,
          weeks: phases.length,
        })
      }
    }),
  )
  return { practiceIds: [...out], legs }
}

/** Back-compat shim: just the practice ids (the pre-chip signature). */
export async function getCurrentLegPracticeIds(profileId: string): Promise<string[]> {
  return (await getCurrentLeg(profileId)).practiceIds
}
