// ─────────────────────────────────────────────────────────────────────────────
// THE GENERIC SPARK (ADR-990). One runner for every guided first draft.
//
// A "Spark" is the opening step of a creation wizard: a few light answers (or a pasted
// write-up, or a photo) go in, and Vera hands back a structured first draft the author
// edits. Four entities did that, and each one had written the SAME twelve-line preamble
// by hand: the kill switch, the per-feature budget cap, the forced-tool call through
// completeRaw, the voice primer, the usage ledger, and the try/catch that degrades to
// null. Four copies of a spend gate is four places for a spend gate to rot.
//
// The preamble lives here once. An entity now DECLARES a SparkSpec (its tool schema, its
// tier, its system prompt, its coercer, its budget key) and calls runSpark. Nothing about
// the surrounding machinery is written per entity again.
//
// It leans on the Studio kernel rather than restating entity knowledge:
//   * `entity` must be a REGISTERED manifest (lib/studio/registry.ts). The catalog is the
//     list of creatable things, so a Spark for something the Studio has never heard of is
//     a bug, not a feature.
//   * The MOOD dial is threaded only when the manifest DECLARES it (`steer.mood`). One
//     control, declared once, steering every wizard, is the whole point of ADR-986. A
//     wizard with no dial can never be silently steered by one.
//
// WHAT DOES NOT CHANGE, and is guarded by spark.test.ts:
//   * Every budget key keeps its exact value and meaning (lib/ai/budget.ts). A spec names
//     a key, it never invents or merges one.
//   * Model tiers stay where they were declared. Sonnet for structured drafting, Haiku for
//     the small one-shot assists, Opus nowhere it was not already.
//   * AI off or over budget returns null, byte for byte the old fallback, so the wizard
//     degrades to hand entry exactly as before.
//   * The raw model shape is never trusted. Every spec supplies a coercer and it runs on
//     every field.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import type { SeedMood } from '@/lib/studio/kernel/moods'
import { studioManifest } from '@/lib/studio/registry'

/**
 * ONE declared draft path. The spec is DATA: it says what to ask the model for and how to
 * distrust the answer. It never says how to gate spend, thread the voice, or record usage,
 * because runSpark does all three the same way for everybody.
 *
 * `T` is the coerced draft the wizard receives. `C` is the extra context the coercer needs
 * and the model must not be trusted for (the week count the author actually asked for, the
 * Pillar they actually picked).
 */
export interface SparkSpec<T, C = undefined> {
  /** The Studio entity id. MUST be registered in lib/studio/registry.ts. */
  entity: string
  /**
   * The budget + ledger key, exactly as it appears in FEATURE_DAILY_CAP_USD. The caps are
   * cost control tuned per surface, so a spec quotes a key and never coins one.
   */
  feature: string
  /** The model tier this draft runs on. Declared, not inferred. */
  tier: ModelTier
  /** The output ceiling for one call. */
  maxTokens: number
  /** The forced-tool schema. `tool.name` is what the runner forces and reads back. */
  tool: Anthropic.Tool
  /**
   * The task prompt, below the voice primer. A function when part of it is only knowable at
   * call time (the Event specs anchor the model to today's date), evaluated per call.
   */
  system: string | (() => string)
  /** Re-coerce every field. Never trust the raw shape. Return null when it is unusable. */
  coerce: (raw: unknown, context: C) => T | null
}

/** One invocation of a declared spark. */
export interface SparkRun<C = undefined> {
  /** The user turn: plain text, or content blocks when the draft reads images. */
  content: string | Anthropic.MessageParam['content']
  /** Facts the coercer needs that the model must not supply. Omitted when the spec needs none. */
  context?: C
  /**
   * The MOOD dial (ADR-986): steers TONE only, never what is true. Threaded into withVoice,
   * and only when the entity's manifest declares the dial.
   */
  mood?: SeedMood | null
  profileId?: string | null
  /**
   * Raise the spec's ceiling for one call. For the case where the SAME draft has a longer
   * variant (structuring a Practice the member already wrote needs more room than drafting
   * one from five short answers). A different budget key is a different spec, never this.
   */
  maxTokens?: number
}

/** Identity helper that pins the generic parameters at the declaration site. */
export function defineSpark<T, C = undefined>(spec: SparkSpec<T, C>): SparkSpec<T, C> {
  return spec
}

/**
 * Run one declared spark. Returns the coerced draft, or null whenever anything is off:
 * AI disabled, the feature over its daily cap, the entity unregistered, the call failed,
 * the model skipped the tool, or the shape did not survive coercion. Every null is the
 * same null the wizard already handled, so it falls back to hand entry.
 */
export async function runSpark<T, C>(spec: SparkSpec<T, C>, run: SparkRun<C>): Promise<T | null> {
  // The kill switch, first and cheapest. AI off means the author types it by hand.
  if (!aiEnabled()) return null

  // The Studio catalog is the list of creatable things. A spark for an entity that is not in
  // it cannot be reviewed or edited by the kernel either, so it fails closed rather than
  // drafting into a surface that does not exist. spark.test.ts catches this at CI time.
  const manifest = studioManifest(spec.entity)
  if (!manifest) return null

  // Per-feature daily cap (lib/ai/budget.ts): over budget means fall back to hand entry,
  // never bill on.
  if (await featureOverBudget(spec.feature)) return null

  // The mood dial is a kernel capability an entity opts into. Absent, withVoice is called with
  // no mood and the prompt is byte for byte what it was before moods existed.
  const mood = manifest.steer?.mood ? (run.mood ?? undefined) : undefined

  try {
    const system = typeof spec.system === 'function' ? spec.system() : spec.system
    const res = await completeRaw({
      tier: spec.tier,
      maxTokens: run.maxTokens ?? spec.maxTokens,
      thinking: { type: 'disabled' },
      system: withVoice(system, mood),
      tools: [spec.tool],
      toolChoice: { type: 'tool', name: spec.tool.name },
      messages: [{ role: 'user', content: run.content }],
    })
    void recordAiUsage({
      feature: spec.feature,
      model: MODELS[spec.tier],
      usage: res.usage,
      costUsd: estimateCostUsd(spec.tier, res.usage),
      profileId: run.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === spec.tool.name,
    )
    return block ? spec.coerce(block.input, run.context as C) : null
  } catch {
    return null
  }
}

// ── Shared coercion helpers ───────────────────────────────────────────────────────────────
// Every spec re-coerces its own fields; these are the three shapes all of them needed, so the
// bounds live in one place instead of four slightly different inline ternaries.

/** A trimmed string clamped to `max`, or '' for anything that is not a usable string. */
export function sparkStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** A trimmed string clamped to `max`, or null when empty. For "only when stated" fields. */
export function sparkStrOrNull(v: unknown, max: number): string | null {
  return sparkStr(v, max) || null
}

/** Trimmed, non-empty strings from an array, each clamped to `max`, at most `cap` of them. */
export function sparkStrArray(v: unknown, max: number, cap: number): string[] {
  return Array.isArray(v)
    ? v
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().slice(0, max))
        .filter(Boolean)
        .slice(0, cap)
    : []
}

/** A finite integer clamped into [min, max], or null. */
export function sparkInt(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : null
}

/** The value when it is one of `allowed`, otherwise `fallback`. Case-insensitive on strings. */
export function sparkEnum<E extends string>(v: unknown, allowed: readonly E[], fallback: E | null = null): E | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (allowed as readonly string[]).includes(s) ? (s as E) : fallback
}
