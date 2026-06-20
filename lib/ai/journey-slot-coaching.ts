// Vera's per-slot coaching prompt for the Journey course builder (JOURNEYS.md §6). When an author
// drops a Practice into a Journey, Vera drafts one short, warm coaching line for that slot —
// grounded in the season, what the author named the Journey, the practice, and its Pillar(s) — so
// the player can nudge the member when they reach that step. Mirrors lib/ai/journey-outline.ts:
// forced-tool structured output + the voice primer + the usage ledger; never trust the raw shape.
// Runs on Haiku (cheap, on-demand) and degrades to null when AI is off or the call fails, so the
// builder always falls back to the author writing the line by hand.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'

const FEATURE = 'journey-slot-coaching'
const TOOL_NAME = 'draft_slot_coaching'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return one short coaching line for this practice slot in the Journey.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'One or two plain sentences (<= 200 chars) the player shows when the member reaches this practice. A nudge to do it, grounded in the season and Pillar. No emoji, no hype, no em dashes.',
      },
    },
    required: ['prompt'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. An author is building a Journey (a short program a Circle moves through together) and has added a Practice as one step. Write ONE short coaching line the player will show the member when they reach this step.

Rules:
- One or two short sentences, plain and concrete. A nudge to actually do the practice, not a description of it.
- Ground it in the season and the practice's Pillar when given, but keep it light. Never narrate the reader's feelings.
- No emoji, no hype, no em dashes. Contractions. Sentence case.
- Never invent facts about the member. Always call the ${TOOL_NAME} tool.`

export async function draftSlotCoaching(input: {
  journeyTitle: string
  practiceTitle: string
  /** The slot's Pillar name(s) (Mind/Body/Spirit/Expression), if known. */
  pillars?: string[]
  /** The current season's name + theme, if a season is live. */
  season?: { name: string; theme?: string | null } | null
  profileId?: string | null
}): Promise<string | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): over budget => return null, so the builder falls back
  // to the author writing the line by hand, never bill on.
  if (await featureOverBudget(FEATURE)) return null
  const practiceTitle = input.practiceTitle.trim().slice(0, 200)
  if (!practiceTitle) return null

  const pillars = (input.pillars ?? []).map((p) => p.trim()).filter(Boolean)
  const userText = [
    `Journey: ${input.journeyTitle.trim().slice(0, 200) || 'Untitled Journey'}`,
    `Practice (this step): ${practiceTitle}`,
    pillars.length ? `Pillar(s): ${pillars.join(', ')}` : '',
    input.season ? `Season: ${input.season.name}${input.season.theme ? ` (${input.season.theme})` : ''}` : '',
    '',
    `Write one short coaching line for this step and call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await completeRaw({
      tier: 'haiku',
      maxTokens: 300,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS.haiku,
      usage: res.usage,
      costUsd: estimateCostUsd('haiku', res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!block) return null
    const raw = block.input as { prompt?: unknown }
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 300) : ''
    return prompt || null
  } catch {
    return null
  }
}
