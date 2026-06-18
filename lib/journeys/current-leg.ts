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

/** The practice ids in the member's CURRENT leg — the latest unlocked drip phase — across every
 *  Journey they are actively enrolled in, de-duped. A Journey with no drip (interval 0) or no
 *  resolvable anchor has one open leg: all of its practices. Returns [] when enrolled in nothing. */
export async function getCurrentLegPracticeIds(profileId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data: adoptions } = await admin
    .from('journey_plan_adoptions')
    .select('plan_id')
    .eq('profile_id', profileId)
    .eq('active', true)
  const planIds = [...new Set(((adoptions ?? []) as { plan_id: string }[]).map((a) => a.plan_id))]
  if (!planIds.length) return []

  const out = new Set<string>()
  await Promise.all(
    planIds.map(async (planId) => {
      const [{ data: items }, { data: planRow }] = await Promise.all([
        admin.from('journey_plan_items').select(BLOCK_COLS).eq('plan_id', planId),
        admin.from('journey_plans').select('drip_interval_days').eq('id', planId).maybeSingle(),
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

      // No anchor or no drip → the whole Journey is one open leg. Otherwise the current leg is the
      // latest unlocked phase (1-based count → last index), matching the player's lock schedule.
      const legPhases =
        !anchorStart || drip <= 0
          ? phases
          : [phases[unlockedPhaseCount(new Date(anchorStart), drip, phases.length) - 1]]

      for (const phase of legPhases) {
        if (!phase) continue
        for (const m of phase.modules) for (const l of m.lessons) if (l.practiceId) out.add(l.practiceId)
      }
    }),
  )
  return [...out]
}
