// Vera's start-a-circle assist. Given the Interest a new circle will practice (and
// whether it meets in person or online), Vera suggests a circle NAME and a short
// ABOUT blurb in her warm voice — a starting point the host edits, never a commit.
// Runs on Haiku (cheap); returns null when AI is off or the call fails, so the
// modal falls back to a deterministic suggestion. Mirrors lib/ai/practice-wizard.ts
// (forced-tool structured output + usage ledger; re-coerce every field, never trust
// the raw shape).

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'

const FEATURE = 'circle-create'

export interface CircleSuggestion {
  name: string
  about: string
}

const TOOL_NAME = 'suggest_circle'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return a suggested name and about blurb for a new local circle.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A short, inviting circle name (≤ 50 chars). Evokes the practice + gathering regularly. No surrounding quotes.',
      },
      about: {
        type: 'string',
        description: 'One or two warm, plain sentences (≤ 240 chars), second person: what they do together and that newcomers are welcome.',
      },
    },
    required: ['name', 'about'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, encouraging guide. A member is starting a CIRCLE, a small local crew (up to ~50 people) who meet regularly around one shared practice. Suggest a name and a short "about" for their circle.

Rules:
- name: short and inviting, evocative of the practice and of gathering regularly. Avoid a generic "X Group"; prefer something a person would want to join. No surrounding quotes.
- about: one or two warm, plain sentences on what they do together and that all levels / newcomers are welcome. Second person, no hype, no emoji.
- Never invent a specific place, day, or any fact you weren't given.
- Always call the suggest_circle tool.`

export async function suggestCircleDraft(input: {
  interest: string
  type: 'in-person' | 'online'
  profileId?: string | null
}): Promise<CircleSuggestion | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): over budget => fall back to fallbackCircleSuggestion,
  // never bill on.
  if (await featureOverBudget(FEATURE)) return null
  const interest = input.interest.trim().slice(0, 120)
  if (!interest) return null

  const userText = [
    `Interest / practice: ${interest}`,
    `Format: ${input.type === 'online' ? 'Online (meets virtually)' : 'In-person (meets locally)'}`,
    '',
    `Suggest a name and about for this circle and call ${TOOL_NAME}.`,
  ].join('\n')

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
    return block ? coerce(block.input) : null
  } catch {
    return null
  }
}

function coerce(raw: unknown): CircleSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().replace(/^["']+|["']+$/g, '').slice(0, 60) : ''
  const about = typeof r.about === 'string' ? r.about.trim().slice(0, 280) : ''
  if (!name) return null
  return { name, about }
}

/** Deterministic, still-useful suggestion for when Vera (AI) is off or over budget,
 *  so the "Suggest" affordance always returns something the host can edit. */
export function fallbackCircleSuggestion(interest: string, type: 'in-person' | 'online'): CircleSuggestion {
  const i = interest.trim() || 'this practice'
  const name = `${type === 'online' ? 'Online ' : ''}${i} Circle`
  const about =
    type === 'online'
      ? `A crew who gather online to practice ${i.toLowerCase()} together, regularly. Newcomers welcome. You just have to show up.`
      : `A local crew who meet regularly to practice ${i.toLowerCase()} together. Newcomers welcome. You just have to show up.`
  return { name, about }
}
