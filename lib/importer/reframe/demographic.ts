// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the DEMOGRAPHIC + POSITIONING pass (Importer v2 #1, ADR-606).
// A short analysis pass that runs just BEFORE the reframe: it reads the VERIFIED draft's own
// marketing language and names, in plain words, WHO this business primarily serves and HOW it is
// positioned in its market. That one-line read is stored on the draft (`demographic`) and folded
// into the reframe grounding so the Frequency-voice copy is aimed at the right reader
// (docs/CONTENT-VOICE.md). It is a private voice STEER, never rendered, never a commercial fact.
//
// TRUST BOUNDARY (docs §4.4): like reframe, this pass grounds ONLY on the verified subset it is
// handed (buildGroundingBlock), so it can never surface an unverified claim. Its output is a
// characterization of the audience, not a fact about the business, so it is not ledgered and cannot
// launder a commercial claim. It is a positioning read, so it may INFER an audience the copy implies.
//
// PURE prompt construction + coercion here; the single model call is `analyzeDemographic`. FAIL-SAFE:
// AI off / over budget / any throw returns null, and the pipeline reframes exactly as it did before
// (backwards-compatible: absent demographic ⇒ current behavior). No em dashes (CONTENT-VOICE §10).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage, featureOverBudget } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import type { BusinessProfile } from '../schema'
import { buildGroundingBlock } from './prompt'

export const DEMOGRAPHIC_FEATURE = 'business-import-demographic'

export const DEMOGRAPHIC_TOOL_NAME = 'save_demographic'

/** The longest demographic steer we keep (a couple of plain sentences); the model is asked for less. */
export const DEMOGRAPHIC_MAX_LEN = 400

/**
 * The forced structured-output tool: a single plain-language read of the primary audience + positioning.
 * One optional string, so a thin business yields nothing rather than a fabricated persona.
 */
export const DEMOGRAPHIC_TOOL: Anthropic.Tool = {
  name: DEMOGRAPHIC_TOOL_NAME,
  description: 'Save a short, plain read of who this business primarily serves and how it is positioned.',
  input_schema: {
    type: 'object',
    properties: {
      demographic: {
        type: 'string',
        description:
          'One or two plain sentences: who this business is primarily for (their situation, not a stereotype) and how it is positioned (premium, budget, expert, community, etc.). No hype, no invented facts. Leave empty if the material is too thin to tell.',
      },
    },
    required: [],
  },
}

export const DEMOGRAPHIC_SYSTEM = `You analyze a verified business and name its primary audience and market positioning for an internal copywriting brief.

You are given a VERIFIED FACTS block. Read its language, category, offerings, and story, then answer two things in plain words:
1. Who is this business primarily for? Describe their situation, not a stereotype (e.g. "busy parents who want a quick honest haircut", not "millennials"). If the facts imply more than one audience, name the primary one.
2. How is it positioned? A few words on where it sits (premium / budget / expert-led / community-first / convenient / boutique, etc.), grounded in what the facts actually say.

Rules:
- Ground only in what you are given. Do not invent a history, a price, or a claim. If the material is too thin to tell, leave it empty.
- Plain language only. No hype, no jargon, no demographic clichés, no em dashes.
- This is an internal steer for a copywriter, not customer-facing copy. Keep it short and useful.

Call ${DEMOGRAPHIC_TOOL_NAME} once.`

/** Coerce the model's raw save_demographic output into a clean demographic steer, or undefined. Trims,
 *  drops non-strings, caps length. PURE + total. */
export function coerceDemographic(raw: unknown): string | undefined {
  const o = (raw ?? {}) as Record<string, unknown>
  const v = o.demographic
  if (typeof v !== 'string') return undefined
  const trimmed = v.replace(/\s+/g, ' ').trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, DEMOGRAPHIC_MAX_LEN)
}

/**
 * Analyze the VERIFIED draft for its primary demographic + positioning (SONNET, forced tool, voice
 * primer). Grounds ONLY on the verified subset (buildGroundingBlock), so it cannot see an unverified
 * claim. Gated on aiEnabled + the per-feature budget cap; returns null when off / over budget / failed,
 * so the pipeline reframes exactly as before. Returns the demographic steer + USD spent on success.
 */
export async function analyzeDemographic(input: {
  verified: BusinessProfile
  profileId?: string | null
}): Promise<{ demographic: string; costUsd: number } | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(DEMOGRAPHIC_FEATURE)) return null
  try {
    const res = await completeRaw({
      tier: 'sonnet',
      maxTokens: 400,
      thinking: { type: 'disabled' },
      system: withVoice(DEMOGRAPHIC_SYSTEM),
      tools: [DEMOGRAPHIC_TOOL],
      toolChoice: { type: 'tool', name: DEMOGRAPHIC_TOOL_NAME },
      messages: [{ role: 'user', content: buildGroundingBlock(input.verified) }],
    })
    void recordAiUsage({
      feature: DEMOGRAPHIC_FEATURE,
      model: MODELS.sonnet,
      usage: res.usage,
      costUsd: estimateCostUsd('sonnet', res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === DEMOGRAPHIC_TOOL_NAME,
    )
    if (!block) return null
    const demographic = coerceDemographic(block.input)
    if (!demographic) return null
    return { demographic, costUsd: res.costUsd }
  } catch {
    return null
  }
}
