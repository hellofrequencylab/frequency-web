// The Person view CONTEXT BAND (Resonance Engine Phase 2 · ALTITUDE 3 · ADR-383). A short
// "where this person is" line for the top of the person detail, drafted from the shared scores +
// lifecycle, in voice. Best-effort Claude through withVoice (the governed primer), with a
// DETERMINISTIC in-voice fallback when AI is off / over budget, mirroring lib/ai/vera/today.ts.
// FAIL-SAFE: never throws; returns the deterministic line on any error. The per-signal "why"
// (explainability) is Phase 3; this band is the plain standing only, no bare-score narration.
//
// authz-delegated: read-only drafting helper; the gate lives at the staff-gated person page that
// calls it. No mutation.

import { withVoice } from '@/lib/ai/voice'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { MemberScores } from '@/lib/dashboard/scores'
import type { ScoreConfidence } from '@/lib/traits/compute'

const LIFECYCLE_PHRASE: Record<string, string> = {
  new: 'just arrived and still finding their feet',
  activated: 'has done a first Practice and is settling in',
  engaged: 'is showing up regularly',
  at_risk: 'has started to drift',
  dormant: 'has gone quiet',
  reactivated: 'is back after a quiet stretch',
}

const NBA_PHRASE: Record<string, string> = {
  reengage: 'A warm note now keeps the tie from cooling.',
  activate: 'A nudge toward a first Practice is the next move.',
  join_circle: 'Anchoring them in a Circle is the next move.',
  deepen: 'There is room to widen what they try.',
  invite: 'They are strong enough to ask to bring people in.',
  none: 'Nothing needs doing here right now.',
}

/** The deterministic, in-voice context line from the shared scores. PURE. Names the standing
 *  plainly (no bare-number narration), then the next move. No em or en dashes. */
export function deterministicContextLine(name: string, scores: MemberScores): string {
  const first = name.trim() || 'This person'
  // No scores yet: say so plainly rather than inventing a standing.
  if (scores.resonanceTier == null && scores.lifecycleStage == null) {
    return `${first} has not been scored yet. After the next overnight refresh, their standing shows here.`
  }
  const stage = scores.lifecycleStage ? LIFECYCLE_PHRASE[scores.lifecycleStage] : null
  const tier = scores.resonanceTier ? tierLabel(scores.resonanceTier) : null
  const move = scores.nextBestAction ? NBA_PHRASE[scores.nextBestAction] : null

  const parts: string[] = []
  if (stage) parts.push(`${first} ${stage}`)
  else parts.push(`${first} is here`)
  if (tier) parts.push(`Resonance reads ${tier.toLowerCase()}`)
  let line = `${parts.join('. ')}.`
  if (move) line += ` ${move}`
  return line
}

// ── Score explainability (the "why" on the Person view score row · Phase 3 · ADR-384) ──────────
// A bare score is never shown. The Person view's MemberScores carry the verdicts but not the full
// feature vector (that lives in member_traits at refresh time), so this derives a plain, ordered
// "top signals" line + a confidence band from the shared scores themselves. PURE + deterministic +
// unit-tested. No dashes. The richer driver derivation (over full PredictiveInputs) is
// explainChurnRisk in lib/traits/compute.ts; this is the read-model-shaped companion.

/** A surface-ready explanation for a member's score row: the top signals + a confidence band. */
export interface ScoreReadout {
  /** Top contributing signals, plain + in voice, most-decisive first (capped). */
  signals: string[]
  confidence: ScoreConfidence
}

const NBA_READOUT: Record<string, string> = {
  reengage: 'gone quiet lately',
  activate: 'has not done a first Practice',
  join_circle: 'not anchored in a Circle',
  deepen: 'active but sticking to one corner',
  invite: 'a strong member with room to lead',
  none: 'steady for now',
}

/**
 * The plain "why" behind a member's scores, from the shared MemberScores. PURE. Orders the strongest
 * drivers first: a high churn read leads, then the recommended next move, then the resonance tier and
 * activation room. Confidence is `high` when scores agree on a clear standing, `low` when the member
 * is barely scored, `medium` otherwise. Never narrates feelings; no dashes.
 */
export function explainMemberScores(scores: MemberScores): ScoreReadout {
  const signals: string[] = []

  if (scores.churnRisk === 'high') signals.push('high churn risk')
  else if (scores.churnRisk === 'medium') signals.push('some churn risk')

  if (scores.nextBestAction && scores.nextBestAction !== 'none') {
    signals.push(NBA_READOUT[scores.nextBestAction] ?? 'has a clear next move')
  }

  if (scores.resonanceTier === 'at_risk') signals.push('resonance reads at risk')
  else if (scores.resonanceTier === 'resonant') signals.push('resonance reads strong')

  if (typeof scores.activationPropensity === 'number' && scores.activationPropensity >= 60) {
    signals.push('high room to move')
  }

  if (signals.length === 0) signals.push('steady, nothing pressing')

  // Confidence from how much standing is known + whether churn + tier agree.
  const known = (scores.churnRisk ? 1 : 0) + (scores.resonanceTier ? 1 : 0) + (scores.lifecycleStage ? 1 : 0)
  let confidence: ScoreConfidence = 'medium'
  if (known <= 1) confidence = 'low'
  else if (
    (scores.churnRisk === 'high' && scores.resonanceTier === 'at_risk') ||
    (scores.churnRisk === 'low' && scores.resonanceTier === 'resonant')
  ) {
    confidence = 'high'
  }

  return { signals: signals.slice(0, 3), confidence }
}

const SYSTEM = withVoice(
  `You write one short "where this person is" line for a community operator looking at a member's profile. You get the member's first name and their standing (lifecycle stage, resonance tier, recommended next move). Write ONE or TWO plain sentences, concrete, no preamble, no dashes. Name the situation plainly, never narrate feelings, do not invent facts beyond the standing. Return ONLY the line.`,
)

/**
 * The context band line. Best-effort Claude (grounded in the standing) through withVoice, with the
 * deterministic in-voice line as the fallback. NEVER throws. Keep the AI call cheap (haiku, tiny
 * budget); when AI is off or over budget, the deterministic line stands.
 */
export async function draftContextLine(name: string, scores: MemberScores): Promise<string> {
  const fallback = deterministicContextLine(name, scores)
  // No real standing to draft from: the deterministic "not scored yet" line is the right answer.
  if (scores.resonanceTier == null && scores.lifecycleStage == null) return fallback
  try {
    if (!(await aiAvailable()) || (await featureOverBudget('today'))) return fallback
    const signal = JSON.stringify({
      name,
      lifecycle_stage: scores.lifecycleStage,
      resonance_tier: scores.resonanceTier,
      next_best_action: scores.nextBestAction,
    })
    const res = await completeText({
      system: SYSTEM,
      messages: [{ role: 'user', content: signal }],
      tier: 'haiku',
      maxTokens: 90,
      cacheSystem: true,
    })
    await recordAiUsage({ feature: 'today', model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const line = (res.text ?? '').trim()
    return line.length > 0 ? line : fallback
  } catch (e) {
    if (e instanceof AiUnavailableError) return fallback
    return fallback
  }
}
