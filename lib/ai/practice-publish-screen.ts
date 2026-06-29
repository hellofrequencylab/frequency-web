// Vera's pre-publish screen for a practice (Phase 2 "Clean" item 2.5, ADR-438).
//
// An ADVISORY read a curator can run before approving a member-proposed practice: Vera scores
// the title + summary + body + tags on three axes — voice (does it sound like Frequency,
// docs/CONTENT-VOICE.md), completeness (is it ready to publish), and safety (any health-claim
// or unsafe-instruction concern) — and returns plain-language notes per axis. It NEVER blocks
// publish: the curator decides; this just surfaces what to look at.
//
// Budget-gated like every AI surface (the platform switch + the per-feature daily cap +
// the global ceiling). When AI is off or over budget, a DETERMINISTIC fallback derives the
// completeness notes from the practice's own fields (no AI, no spend) so the screen always
// returns something useful. Server-only; the curator gate lives at the calling action.

import { getPractice, getPracticeTagLabels } from '@/lib/practices'
import { computeQualityScore } from '@/lib/practices/quality'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { completeText, AiUnavailableError } from './complete'
import { withVoice } from './voice'

const FEATURE = 'practice-publish-screen'

/** The screen result. `ok` is an advisory pass/fail (score ≥ threshold AND no safety note);
 *  the three string arrays are the plain-language notes per axis (empty = nothing flagged). */
export interface PracticeScreenResult {
  /** Advisory only: true when the score clears the bar and nothing safety-flagged. Never gates. */
  ok: boolean
  /** 0-100 overall readiness (the quality score, AI-nudged when AI ran). */
  score: number
  /** Voice/copy notes (em dashes, vibe-verbs, hype, narrated feelings, health claims in copy). */
  voice: string[]
  /** Completeness notes (missing summary/body/Pillar/length/image/sub-category). */
  completeness: string[]
  /** Safety notes (medical/cure claims, unsafe instructions). Any note here flips `ok` to false. */
  safety: string[]
}

/** The advisory pass bar. A practice at/above this with no safety note reads as "looks ready". */
const SCREEN_PASS_SCORE = 60

const SCREEN_SYSTEM = `You are Vera, reviewing a member-submitted Practice before a human curator decides whether to publish it to the Frequency library. You do NOT approve or reject; you flag what the curator should look at. Read the title, summary, body, and tags, then report concerns on three axes:

- VOICE: copy that breaks the Frequency voice. Flag em dashes, the banned vibe-verbs (tap into, drop into, hold space, lean into, etc.), hype words (unlock, elevate, transform your life, level up, supercharge), sentences that narrate the reader's feelings, or surface wellness jargon on what should be plain copy. Quote the offending phrase briefly.
- COMPLETENESS: what a publishable practice is missing (a clear summary, real instructions in the body, a sensible length, the point of the practice). Be concrete.
- SAFETY: any medical or cure claim (treats anxiety, cures depression, etc.) or any instruction that could hurt someone (hold your breath for minutes, ignore pain, etc.). Health language must stay relational, never medical.

Return STRICT JSON only, no prose around it, in exactly this shape:
{"voice":["..."],"completeness":["..."],"safety":["..."]}
Each array holds short plain-language notes (zero to four each). An empty array means nothing to flag on that axis. Use no em dashes in your notes.`

/** Parse Vera's JSON reply into the three note arrays, tolerating fenced code blocks + junk.
 *  A note is trimmed, capped, and a stray non-string is dropped — a malformed reply degrades
 *  to empty arrays rather than throwing. */
function parseScreenJson(text: string): { voice: string[]; completeness: string[]; safety: string[] } {
  const empty = { voice: [], completeness: [], safety: [] }
  if (!text) return empty
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return empty
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return empty
  }
  if (!parsed || typeof parsed !== 'object') return empty
  const obj = parsed as Record<string, unknown>
  const arr = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 4)
  return { voice: arr(obj.voice), completeness: arr(obj.completeness), safety: arr(obj.safety) }
}

/**
 * Pre-publish screen for one practice. Always returns a result (never throws): AI when it is
 * available + in budget, the deterministic fallback otherwise. The score is the pure quality
 * score (so it is stable + explainable); the AI run only adds voice/safety NOTES, it does not
 * move the number. ADVISORY — the caller (a curator) decides; this never blocks publish.
 *
 * authz-delegated: the curator gate lives at the calling action (screenPracticeAction).
 */
export async function screenPracticeForPublish(practiceId: string): Promise<PracticeScreenResult> {
  const practice = await getPractice(practiceId)
  if (!practice) {
    return { ok: false, score: 0, voice: [], completeness: ['Practice not found.'], safety: [] }
  }
  const tags = await getPracticeTagLabels(practiceId)

  // The stable, AI-free score + completeness notes. (Engagement/freshness inputs are zero here:
  // a pending practice has no usage yet, so the score leans on completeness — exactly right for
  // a pre-publish read.) This is also the whole deterministic fallback when AI is off.
  const quality = computeQualityScore({
    title: practice.title,
    summary: practice.summary,
    body: practice.body,
    header_image: practice.header_image,
    domain_id: practice.domain_id,
    subcategory_id: practice.subcategory_id,
    duration_min: practice.duration_min,
    adopters: 0,
    logs_30d: 0,
    logs_total: 0,
    updated_at: new Date().toISOString(), // a pending practice is fresh; don't penalize freshness pre-publish
  })
  // The completeness notes are the score's content-gap issues (drop the usage/freshness ones,
  // which are meaningless before publish).
  const usageIssues = new Set(['Never logged', 'No logs in 30 days', 'No freshness date', 'Not touched in 6 months'])
  const completeness = quality.issues.filter((i) => !usageIssues.has(i))

  // Deterministic fallback: AI off or over budget → return the field-derived screen, no spend.
  const available = (await aiAvailable()) && !(await featureOverBudget(FEATURE))
  if (!available) {
    return {
      ok: quality.score >= SCREEN_PASS_SCORE,
      score: quality.score,
      voice: [],
      completeness,
      safety: [],
    }
  }

  try {
    const tagLine = tags.length ? tags.join(', ') : '(none)'
    const res = await completeText({
      system: withVoice(SCREEN_SYSTEM),
      messages: [
        {
          role: 'user',
          content:
            `Review this Practice for the curator.\n\n` +
            `TITLE: ${practice.title ?? '(none)'}\n` +
            `SUMMARY: ${practice.summary ?? '(none)'}\n` +
            `BODY: ${(practice.body ?? '(none)').slice(0, 4000)}\n` +
            `TAGS: ${tagLine}\n\n` +
            `Return the JSON described in your instructions.`,
        },
      ],
      tier: 'haiku',
      maxTokens: 400,
    })
    await recordAiUsage({ feature: FEATURE, model: res.tier, usage: res.usage, costUsd: res.costUsd })
    const notes = parseScreenJson(res.text)
    // Merge the AI's completeness notes with the deterministic ones (dedup), so the screen is
    // never WEAKER than the field check even if Vera misses a gap.
    const mergedCompleteness = [...new Set([...completeness, ...notes.completeness])].slice(0, 6)
    return {
      // A safety note (medical/cure claim or unsafe instruction) flips the advisory pass off.
      ok: quality.score >= SCREEN_PASS_SCORE && notes.safety.length === 0,
      score: quality.score,
      voice: notes.voice,
      completeness: mergedCompleteness,
      safety: notes.safety,
    }
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      // Race: AI went down between the check and the call. Fall back deterministically.
      return { ok: quality.score >= SCREEN_PASS_SCORE, score: quality.score, voice: [], completeness, safety: [] }
    }
    throw e
  }
}
