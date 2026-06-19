// Vera memory compression (AI-VERA.md §5, ADR-066; build-list P6 §2.3).
// Member memory (lib/ai/memory.ts) accumulates facts + a rolling summary but is
// never compressed, so it grows unbounded and gets noisier as Vera's context.
// This module keeps it bounded and useful: a periodic batch (the
// summarize-vera-memory cron) compresses members whose memory has grown large or
// gone stale into a compact digest.
//
// The interesting logic — WHO needs compression, and the deterministic fallback
// digest when AI is off / over budget — is pure and unit-tested here. The AI path
// (Claude via the kernel, budget-gated) lives in compressMemberMemory; the cron
// orchestrates. We write back through the existing memory store (writeDigest in
// memory.ts), never bypassing it.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, aiAvailable, featureOverBudget } from './usage'
import { claimMembersDueForSummary, writeDigest, type MemberContext, type MemberFacts } from './memory'

// ── Thresholds: only compress memory that's actually grown or gone stale ───────

/** Facts (across all lists) beyond which the record is worth compressing. */
export const FACT_COUNT_THRESHOLD = 30
/** Summary length (chars) beyond which it's worth re-compressing. */
export const SUMMARY_CHARS_THRESHOLD = 1200
/** Interactions since the last summarize that warrant a refresh even if small. */
export const INTERACTION_DRIFT_THRESHOLD = 25
/** A summarized record older than this (days) is refreshed regardless of size. */
export const STALE_DAYS_THRESHOLD = 30

// ── Output discipline: what a compressed digest must fit within ────────────────

/** Hard cap on the rolling summary (chars) after compression. */
export const MAX_SUMMARY_CHARS = 800
/** Hard cap on each fact list after compression — the highest-signal survive. */
export const MAX_FACTS_PER_LIST = 12

/** A row's shape for the selection layer. `interactionCount` is the live counter;
 *  `summarizedAtInteractionCount`/`lastSummarizedAt` capture the last compression. */
export interface MemoryStaleness {
  factCount: number
  summaryChars: number
  interactionCount: number
  /** interaction_count snapshot at the last summarize (null if never summarized). */
  summarizedAtInteractionCount: number | null
  /** ISO timestamp of the last summarize, or null if never summarized. */
  lastSummarizedAt: string | null
}

/** Total facts across all list fields in a MemberFacts. Pure. */
export function countFacts(facts: MemberFacts): number {
  return (
    (facts.interests?.length ?? 0) +
    (facts.goals?.length ?? 0) +
    (facts.constraints?.length ?? 0) +
    (facts.neighborhood ? 1 : 0)
  )
}

/** Project a MemberContext (+ stored summarize markers) into the staleness shape. */
export function stalenessOf(
  ctx: Pick<MemberContext, 'summary' | 'facts' | 'interactionCount'>,
  markers: { summarizedAtInteractionCount: number | null; lastSummarizedAt: string | null },
): MemoryStaleness {
  return {
    factCount: countFacts(ctx.facts),
    summaryChars: (ctx.summary ?? '').length,
    interactionCount: ctx.interactionCount,
    summarizedAtInteractionCount: markers.summarizedAtInteractionCount,
    lastSummarizedAt: markers.lastSummarizedAt,
  }
}

/**
 * Pure: does this member's memory warrant compression now? Compress when ANY of:
 *  - facts have grown past the count threshold (the noisy case), OR
 *  - the rolling summary has grown past the length threshold, OR
 *  - enough new interactions have accrued since the last summarize (drift), OR
 *  - it was summarized but is now stale (older than STALE_DAYS_THRESHOLD).
 *
 * A record with little memory and no drift is left alone — compressing it would
 * only spend tokens to restate what's already compact.
 */
export function needsCompression(s: MemoryStaleness, now: Date = new Date()): boolean {
  if (s.factCount > FACT_COUNT_THRESHOLD) return true
  if (s.summaryChars > SUMMARY_CHARS_THRESHOLD) return true

  // Drift: new interactions since the last summarize (or since creation if never).
  const base = s.summarizedAtInteractionCount ?? 0
  if (s.interactionCount - base >= INTERACTION_DRIFT_THRESHOLD) return true

  // Staleness: a previously-summarized record that's aged out and has SOME content.
  if (s.lastSummarizedAt && (s.factCount > 0 || s.summaryChars > 0)) {
    const ageMs = now.getTime() - new Date(s.lastSummarizedAt).getTime()
    if (ageMs >= STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000) return true
  }
  return false
}

/** A compressed memory digest: the new rolling summary + trimmed facts. */
export interface MemoryDigest {
  summary: string
  facts: MemberFacts
}

/**
 * Pure, deterministic fallback compression — used when AI is off / over budget,
 * and as the floor the AI path is coerced back into. Keeps the highest-signal,
 * most-recent facts (mergeFacts appends newest last and caps lists, so the TAIL
 * is freshest) and clamps the summary to MAX_SUMMARY_CHARS. No model, no I/O.
 */
export function fallbackDigest(ctx: Pick<MemberContext, 'summary' | 'facts'>): MemoryDigest {
  const trim = (list: string[] | undefined): string[] | undefined => {
    if (!list || list.length === 0) return undefined
    // Keep the freshest (tail) when over the cap.
    const kept = list.length > MAX_FACTS_PER_LIST ? list.slice(-MAX_FACTS_PER_LIST) : list
    return kept
  }

  const facts: MemberFacts = {}
  const interests = trim(ctx.facts.interests)
  const goals = trim(ctx.facts.goals)
  const constraints = trim(ctx.facts.constraints)
  if (interests) facts.interests = interests
  if (goals) facts.goals = goals
  if (constraints) facts.constraints = constraints
  if (ctx.facts.neighborhood !== undefined) facts.neighborhood = ctx.facts.neighborhood

  const summary = clampSummary(ctx.summary ?? '')
  return { summary, facts }
}

/** Clamp a summary to MAX_SUMMARY_CHARS at a word boundary where possible. */
export function clampSummary(summary: string): string {
  const s = summary.trim()
  if (s.length <= MAX_SUMMARY_CHARS) return s
  const cut = s.slice(0, MAX_SUMMARY_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > MAX_SUMMARY_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/**
 * Coerce a model's proposed digest back onto the deterministic guarantees: never
 * exceed the caps, never invent list shapes, and never end up emptier than the
 * fallback would have been. The model can rewrite the SUMMARY freely (that's the
 * point), but facts are clamped to MAX_FACTS_PER_LIST and summaries to
 * MAX_SUMMARY_CHARS. If the model returns an unusable shape, fall back.
 */
export function coerceDigest(
  raw: unknown,
  source: Pick<MemberContext, 'summary' | 'facts'>,
): MemoryDigest {
  const floor = fallbackDigest(source)
  if (!raw || typeof raw !== 'object') return floor
  const r = raw as Record<string, unknown>

  const summary = typeof r.summary === 'string' ? clampSummary(r.summary) : floor.summary

  const coerceList = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const seen = new Map<string, string>()
    for (const item of v) {
      const t = typeof item === 'string' ? item.trim() : ''
      if (!t) continue
      const k = t.toLowerCase()
      if (!seen.has(k)) seen.set(k, t.slice(0, 120))
    }
    const list = [...seen.values()]
    if (list.length === 0) return undefined
    return list.slice(0, MAX_FACTS_PER_LIST)
  }

  const facts: MemberFacts = {}
  const interests = coerceList(r.interests) ?? floor.facts.interests
  const goals = coerceList(r.goals) ?? floor.facts.goals
  const constraints = coerceList(r.constraints) ?? floor.facts.constraints
  if (interests) facts.interests = interests
  if (goals) facts.goals = goals
  if (constraints) facts.constraints = constraints

  // Neighborhood: a non-empty string overrides; otherwise keep the source's.
  if (typeof r.neighborhood === 'string' && r.neighborhood.trim()) {
    facts.neighborhood = r.neighborhood.trim().slice(0, 120)
  } else if (source.facts.neighborhood !== undefined) {
    facts.neighborhood = source.facts.neighborhood
  }

  // Never let the model EMPTY a record that had content — fall back if it did.
  if (!summary && countFacts(facts) === 0 && (floor.summary || countFacts(floor.facts) > 0)) {
    return floor
  }
  return { summary, facts }
}

// ── AI compression path (kernel) ───────────────────────────────────────────────

/** Lowest sensible tier for internal-context compression: cheap, high-volume. */
export const SUMMARY_TIER: ModelTier = 'haiku'
export const SUMMARY_FEATURE = 'vera-memory'

const TOOL_NAME = 'write_member_digest'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Return a compressed digest of a member's memory: a tight rolling summary plus the most useful, current facts. Drop stale, redundant, or low-signal items. Never invent anything.",
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'A tight rolling summary of who this member is and what matters to Vera, in plain prose. At most a few sentences. Merge the existing summary with the facts; drop anything stale or redundant. Do not invent.',
      },
      interests: { type: 'array', items: { type: 'string' }, description: 'The most relevant current interests (deduped, concise). Drop stale ones.' },
      goals: { type: 'array', items: { type: 'string' }, description: 'The most relevant current goals. Drop achieved or stale ones.' },
      constraints: { type: 'array', items: { type: 'string' }, description: 'Current constraints worth remembering (e.g. schedule, accessibility). Drop stale ones.' },
      neighborhood: { type: 'string', description: "The member's neighborhood, if known. Omit if unknown." },
    },
    required: ['summary'],
  },
}

// Internal context, NOT member-facing copy — but still routed cleanly through the
// kernel. The voice primer is deliberately omitted: this digest is never shown to a
// member, and the priority is faithful, lossless-as-possible compression, not voice.
const SYSTEM = `You compress a member's private memory for Vera, Frequency's guide. You are given the member's current rolling summary and extracted facts. Produce a COMPRESSED digest that stays useful as future context while dropping noise.

Rules, follow exactly:
- Call the ${TOOL_NAME} tool. Output nothing else.
- This is internal context, never shown to the member. Be faithful and concise; do NOT invent, embellish, or add facts not present in the input.
- The summary is a tight rolling prose summary (a few sentences at most): merge the old summary with the facts, keep what still matters, drop what's stale, redundant, or low-signal.
- Keep only the most relevant, current facts in each list. Prefer recent and specific over old and vague. Deduplicate.
- If a list has nothing worth keeping, return it empty or omit it. Never pad.`

function factsToPrompt(ctx: Pick<MemberContext, 'summary' | 'facts'>): string {
  const f = ctx.facts
  const lines: string[] = []
  lines.push(`Current rolling summary:\n${(ctx.summary ?? '').trim() || '(none yet)'}`)
  lines.push('')
  lines.push('Current facts:')
  lines.push(`- interests: ${(f.interests ?? []).join(', ') || '(none)'}`)
  lines.push(`- goals: ${(f.goals ?? []).join(', ') || '(none)'}`)
  lines.push(`- constraints: ${(f.constraints ?? []).join(', ') || '(none)'}`)
  lines.push(`- neighborhood: ${f.neighborhood ?? '(unknown)'}`)
  return lines.join('\n')
}

/**
 * Compress one member's memory into a digest. Uses the kernel (Claude, lowest
 * tier) when a client is configured; otherwise — and on ANY failure or unusable
 * model output — returns the deterministic fallbackDigest. The result is always
 * clamped to the digest caps via coerceDigest, so a model can never blow the
 * bounds or empty a non-empty record. The caller (cron) is responsible for the
 * kill-switch + budget gates BEFORE calling this with AI on; pass `useAi: false`
 * to force the deterministic path.
 */
export async function compressMemberMemory(
  ctx: Pick<MemberContext, 'summary' | 'facts'> & { profileId?: string | null },
  opts: { useAi: boolean },
): Promise<{ digest: MemoryDigest; usedAi: boolean }> {
  if (!opts.useAi) return { digest: fallbackDigest(ctx), usedAi: false }

  if (!aiEnabled()) return { digest: fallbackDigest(ctx), usedAi: false }

  try {
    const res = await completeRaw({
      tier: SUMMARY_TIER,
      maxTokens: 800,
      thinking: { type: 'disabled' },
      system: SYSTEM,
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: `Compress this member's memory and call ${TOOL_NAME}:\n\n${factsToPrompt(ctx)}` }],
    })

    void recordAiUsage({
      feature: SUMMARY_FEATURE,
      model: MODELS[SUMMARY_TIER],
      usage: res.usage,
      costUsd: estimateCostUsd(SUMMARY_TIER, res.usage),
      profileId: ctx.profileId ?? null,
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    // coerceDigest clamps to the caps and never empties a non-empty record.
    return { digest: coerceDigest(block?.input, ctx), usedAi: true }
  } catch {
    // AI off mid-call / transient failure: deterministic floor, no spend recorded.
    return { digest: fallbackDigest(ctx), usedAi: false }
  }
}

// ── Batch orchestration (the cron's worker) ────────────────────────────────────

/** How many members one cron tick may sweep. Bounded so the job never runs long. */
export const SUMMARY_BATCH_LIMIT = 50

export type SummarizeResult = {
  /** Members claimed from the store this run. */
  scanned: number
  /** Members that the selection logic judged due for compression. */
  due: number
  /** Members actually compressed + written back. */
  compressed: number
  /** Of those, how many used the AI path (vs the deterministic fallback). */
  withAi: number
  /** Per-member write failures (swallowed; counted for visibility). */
  errors: number
  /** Index signature so the result is loggable as structured fields. */
  [key: string]: number
}

/**
 * Compress the member memory of a bounded batch (build-list P6 §2.3). Claims due
 * members, applies the pure selection logic, gates AI ONCE for the whole run
 * (kill switch + per-feature daily budget), then compresses each best-effort and
 * writes the digest back via the existing memory store. A failure on one member
 * never aborts the batch. Idempotent enough to run on any schedule.
 */
export async function summarizeVeraMemory(
  opts: { limit?: number; now?: Date } = {},
): Promise<SummarizeResult> {
  const limit = opts.limit ?? SUMMARY_BATCH_LIMIT
  const now = opts.now ?? new Date()

  const candidates = await claimMembersDueForSummary(limit)
  const result: SummarizeResult = { scanned: candidates.length, due: 0, compressed: 0, withAi: 0, errors: 0 }

  const due = candidates.filter((c) =>
    needsCompression(
      stalenessOf(c, {
        summarizedAtInteractionCount: c.summarizedAtInteractionCount,
        lastSummarizedAt: c.lastSummarizedAt,
      }),
      now,
    ),
  )
  result.due = due.length
  if (due.length === 0) return result

  // One spend gate for the whole run: when AI is off OR over budget, every member
  // still gets compressed — deterministically — so memory stays bounded with no spend.
  const useAi = (await aiAvailable()) && !(await featureOverBudget(SUMMARY_FEATURE))

  for (const member of due) {
    try {
      // Re-check budget per member so a long batch can't run past the daily cap.
      const allowAi = useAi && !(await featureOverBudget(SUMMARY_FEATURE))
      const { digest, usedAi } = await compressMemberMemory(
        { summary: member.summary, facts: member.facts, profileId: member.profileId },
        { useAi: allowAi },
      )
      await writeDigest(member.profileId, digest, {
        interactionCount: member.interactionCount,
        milestones: member.milestones,
        now,
      })
      result.compressed += 1
      if (usedAi) result.withAi += 1
    } catch {
      // Best-effort per member — one failure must not abort the batch.
      result.errors += 1
    }
  }

  return result
}
