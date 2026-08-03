// The leg-target computation (ADR-920 Phase 2): given a Journey's block rows and its drip
// anchor, which practice ids should a member hold RIGHT NOW?
//
//   * The CURRENT LEG — the latest unlocked drip phase's practices (or every phase's, for a
//     no-drip Journey where all weeks are open at once).
//   * The ANCHOR(s) — practice blocks flagged `settings.anchor` (ADR-307), the Journey's daily
//     through-line: adopted for the WHOLE journey, in every week's list, retired only at
//     completion (where the "Keep it" conversion offers to make it the member's own).
//
// PURE (no I/O): callers load the blocks (with settings) and resolve the anchor date; the
// enroll path (adoptPlan / Run start), the On Air reader (getCurrentLeg), and the rollover
// reconcile all compute targets HERE so the three can never disagree.

import { buildJourneyTree, type BlockRow } from './tree'
import { unlockedPhaseCount } from './schedule'

/** BlockRow plus the settings jsonb (the anchor flag lives there). */
export interface BlockRowWithSettings extends BlockRow {
  settings?: { anchor?: boolean } | null
}

export interface LegTargets {
  /** Current-leg practice ids UNION the anchors — the full set a member should hold now. */
  targetIds: string[]
  /** The anchor subset (journey-long through-line). */
  anchorIds: string[]
  /** 1-based current week, or null when every week is open (no drip / no anchor date). */
  week: number | null
  /** Total phases. */
  weeks: number
}

/** Compute the target set. `anchorStart` = the Run's start (cohort) or the member's solo
 *  enrollment start; null (or dripDays <= 0) = every phase open. PURE. */
export function computeLegTargets(
  blocks: BlockRowWithSettings[],
  anchorStart: Date | null,
  dripDays: number,
): LegTargets {
  const { phases } = buildJourneyTree(blocks, [])
  if (!phases.length) return { targetIds: [], anchorIds: [], week: null, weeks: 0 }

  // Anchors: practice blocks flagged settings.anchor — but only those that are part of the
  // PLAYABLE tree (a phase's lessons). buildJourneyTree drops root-level module blocks
  // entirely, so an anchor authored there would ride the target set of a journey whose
  // player never shows it; scope to what the member can actually reach.
  const playable = new Set<string>()
  for (const phase of phases) for (const m of phase.modules) for (const l of m.lessons) if (l.practiceId) playable.add(l.practiceId)
  const anchorIds = [
    ...new Set(
      blocks
        .filter((b) => b.practice_id && b.settings?.anchor === true && playable.has(b.practice_id))
        .map((b) => b.practice_id as string),
    ),
  ]

  const week = !anchorStart || dripDays <= 0 ? null : unlockedPhaseCount(anchorStart, dripDays, phases.length)
  const legPhases = week === null ? phases : [phases[week - 1]]

  const ids = new Set<string>(anchorIds)
  for (const phase of legPhases) {
    if (!phase) continue
    for (const m of phase.modules) for (const l of m.lessons) if (l.practiceId) ids.add(l.practiceId)
  }
  return { targetIds: [...ids], anchorIds, week, weeks: phases.length }
}
