// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REFRAME run (P2, docs/BUSINESS-IMPORTER.md §5 stage 5). Feed
// the VERIFIED draft (never the raw harvest) to Claude (SONNET) with the voice primer + a forced
// structured-output tool, and get back the Frequency-voice copy: the tagline, the about line, the
// story, and per-offering blurbs. Then run the CONTENT-VOICE §10 machine checklist (voice-check):
// copy that fails is REGENERATED once, then flagged rather than shipped (docs §4.6).
//
// Reuses the app's single AI chokepoint (completeRaw with a forced tool_choice, the events-ai.ts
// pattern) + withVoice + the budget / kill gates. FAIL-SAFE: AI off, over budget, or a thrown call
// returns null; the pipeline then leaves the verified draft unchanged (no fabricated prose). This
// stage GROUNDS only on the verified subset it is passed, so it can never launder an unverified
// commercial fact into copy (docs §4.4). No em dashes in this file (CONTENT-VOICE §10).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage, featureOverBudget } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import type { BusinessProfile } from '../schema'
import { REFRAME_SYSTEM, REFRAME_TOOL, REFRAME_TOOL_NAME, buildGroundingBlock } from './prompt'
import { checkVoice, voiceReason, type VoiceVerdict } from './voice-check'
import type { ReframedCopy } from './apply'

export const REFRAME_FEATURE = 'business-import-reframe'

/** The result of a reframe run: the raw voiced copy the model returned + the per-field voice verdict
 *  + the USD spent. Null when AI is unavailable (the pipeline then keeps the verified draft as-is). */
export interface ReframeRunResult {
  copy: ReframedCopy
  /** The §10 checklist verdict on the FINAL copy (after at most one regeneration). Non-ok = flag amber. */
  voice: VoiceVerdict
  costUsd: number
}

/** Coerce the model's raw save_reframed_copy output into a clean ReframedCopy. Drops non-strings,
 *  trims, and keeps only well-formed offering-blurb entries. PURE + total. */
export function coerceReframe(raw: unknown): ReframedCopy {
  const o = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined
    const t = v.trim()
    return t ? t : undefined
  }
  const out: ReframedCopy = {}
  const tagline = str(o.tagline)
  const about = str(o.about)
  const story = str(o.story)
  if (tagline) out.tagline = tagline
  if (about) out.about = about
  if (story) out.story = story
  if (Array.isArray(o.offeringBlurbs)) {
    const blurbs: { index: number; blurb: string }[] = []
    for (const e of o.offeringBlurbs) {
      if (!e || typeof e !== 'object') continue
      const index = (e as { index?: unknown }).index
      const blurb = str((e as { blurb?: unknown }).blurb)
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && blurb) {
        blurbs.push({ index, blurb })
      }
    }
    if (blurbs.length) out.offeringBlurbs = blurbs
  }
  return out
}

/** The concatenated generated copy, for one voice check over the whole reframe output. PURE. */
export function joinReframeCopy(copy: ReframedCopy): string {
  return [
    copy.tagline,
    copy.about,
    copy.story,
    ...(copy.offeringBlurbs ?? []).map((b) => b.blurb),
  ]
    .filter(Boolean)
    .join('\n')
}

/** One model call: forced tool, sonnet, voice primer. Returns the coerced copy + cost, or null on
 *  any failure. `extraSystem` appends a corrective note on the regeneration pass. */
async function callReframe(
  verified: BusinessProfile,
  profileId: string | null | undefined,
  extraSystem = '',
): Promise<{ copy: ReframedCopy; costUsd: number } | null> {
  try {
    const res = await completeRaw({
      tier: 'sonnet',
      maxTokens: 1500,
      thinking: { type: 'disabled' },
      system: withVoice(REFRAME_SYSTEM + extraSystem),
      tools: [REFRAME_TOOL],
      toolChoice: { type: 'tool', name: REFRAME_TOOL_NAME },
      messages: [{ role: 'user', content: buildGroundingBlock(verified) }],
    })
    void recordAiUsage({
      feature: REFRAME_FEATURE,
      model: MODELS.sonnet,
      usage: res.usage,
      costUsd: estimateCostUsd('sonnet', res.usage),
      profileId: profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === REFRAME_TOOL_NAME,
    )
    if (!block) return null
    return { copy: coerceReframe(block.input), costUsd: res.costUsd }
  } catch {
    return null
  }
}

/**
 * Reframe a VERIFIED draft into Frequency-voice copy (SONNET, forced tool, voice primer). Gated on
 * aiEnabled + the per-feature budget cap; returns null when off / over-budget / failed so the
 * pipeline leaves the verified draft unchanged. Runs the §10 machine checklist on the output; if it
 * trips, regenerates ONCE with a corrective note, then returns whichever result is cleaner with its
 * verdict (a non-ok verdict is the pipeline's cue to flag the copy amber, docs §4.6).
 *
 * `verified` MUST be the verifier's verified subset (docs §4.4): this function has no other source,
 * so it cannot see an unverified commercial claim, so it cannot launder one into prose.
 */
export async function reframe(input: {
  verified: BusinessProfile
  profileId?: string | null
}): Promise<ReframeRunResult | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(REFRAME_FEATURE)) return null

  const first = await callReframe(input.verified, input.profileId)
  if (!first) return null

  let costUsd = first.costUsd
  let copy = first.copy
  let verdict = checkVoice(joinReframeCopy(copy))

  if (!verdict.ok) {
    // Regenerate ONCE with a corrective nudge naming what tripped (docs §4.6).
    const corrective = `\n\nA previous attempt failed the voice checklist (${voiceReason(verdict)}). Rewrite it clean: plain sentences, no hype, no jargon, no em dashes, no health claims, at most one exclamation point.`
    const second = await callReframe(input.verified, input.profileId, corrective)
    if (second) {
      costUsd += second.costUsd
      const secondVerdict = checkVoice(joinReframeCopy(second.copy))
      // Keep the cleaner of the two (fewer issues wins; ties keep the retry).
      if (secondVerdict.issues.length <= verdict.issues.length) {
        copy = second.copy
        verdict = secondVerdict
      }
    }
  }

  return { copy, voice: verdict, costUsd }
}
