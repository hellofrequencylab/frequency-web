// Journeys v2 — reward firing logic (ADR-252, docs/JOURNEYS.md §4). Pure: given the journey
// tree BEFORE and AFTER a lesson check-off, decide which milestone rewards just unlocked — a
// phase completing, or the whole journey completing. The caller (a server action) grants the
// Gems/trophies and dedupes on the idempotency keys returned here. Cooperative Circle group
// trophies are derived separately at the Run level (J2), not here.
//
// Guardrail (research, §10): points/trophies SIGNAL progress and map to real mastery (finishing
// a phase). They never gate the learning and are always paired with celebration, so completion
// feels earned, not transactional.

import type { JourneyTree } from './tree'

export type JourneyRewardKind = 'phase_complete' | 'journey_complete'

export interface JourneyRewardEvent {
  kind: JourneyRewardKind
  /** Set for phase_complete. */
  phaseId?: string
  phaseTitle?: string
  /** Stable, exactly-once key for reward_grants. */
  idempotencyKey: string
}

/**
 * The milestone rewards newly unlocked by the transition `before → after`, for one member on
 * one plan. Returns a phase_complete event for each phase that just flipped to complete, and a
 * journey_complete event if the whole journey just finished. Empty when nothing crossed a line.
 */
export function rewardEventsForTransition(opts: {
  profileId: string
  planId: string
  before: JourneyTree
  after: JourneyTree
}): JourneyRewardEvent[] {
  const { profileId, planId, before, after } = opts
  const events: JourneyRewardEvent[] = []

  const wasComplete = new Map(before.phases.map((p) => [p.id, p.complete]))
  for (const p of after.phases) {
    if (p.complete && !wasComplete.get(p.id)) {
      events.push({
        kind: 'phase_complete',
        phaseId: p.id,
        phaseTitle: p.title,
        idempotencyKey: `journey.phase.complete:${profileId}:${planId}:${p.id}`,
      })
    }
  }

  if (after.complete && !before.complete) {
    events.push({
      kind: 'journey_complete',
      idempotencyKey: `journey.complete:${profileId}:${planId}`,
    })
  }

  return events
}
