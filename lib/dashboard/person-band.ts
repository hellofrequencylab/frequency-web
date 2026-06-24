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
