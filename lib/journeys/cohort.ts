// Journeys v2 — cohort aggregation (ADR-252, docs/JOURNEYS.md §3). Pure: roll up each Run
// member's individual progress into the SHARED Circle meter and the group-completion facts
// that mint cooperative trophies. Cooperative by design (research §10): the cohort sees one
// shared meter and group wins — there is no per-member ranking here.

export interface MemberCompletion {
  profileId: string
  /** This member's overall percent (0-100). */
  percent: number
  /** Phase ids this member has completed. */
  completedPhaseIds: readonly string[]
  /** This member has finished the whole journey. */
  journeyComplete: boolean
}

export interface PhaseCohort {
  phaseId: string
  /** How many members have completed this phase. */
  completed: number
  total: number
  /** Every member has completed this phase → group phase trophy. */
  allComplete: boolean
}

export interface CohortProgress {
  memberCount: number
  /** The shared meter — the cohort's mean completion (0-100). */
  meanPercent: number
  phases: PhaseCohort[]
  /** How many members finished the whole journey. */
  journeyCompleted: number
  /** Every member finished the journey → Circle group trophy. */
  allComplete: boolean
}

/** Aggregate the Run members' progress into the shared cohort view. */
export function aggregateCohort(
  members: readonly MemberCompletion[],
  phaseIds: readonly string[],
): CohortProgress {
  const memberCount = members.length
  const meanPercent = memberCount
    ? Math.round(members.reduce((s, m) => s + m.percent, 0) / memberCount)
    : 0

  const phases: PhaseCohort[] = phaseIds.map((phaseId) => {
    const completed = members.filter((m) => m.completedPhaseIds.includes(phaseId)).length
    return { phaseId, completed, total: memberCount, allComplete: memberCount > 0 && completed === memberCount }
  })

  const journeyCompleted = members.filter((m) => m.journeyComplete).length

  return {
    memberCount,
    meanPercent,
    phases,
    journeyCompleted,
    allComplete: memberCount > 0 && journeyCompleted === memberCount,
  }
}
