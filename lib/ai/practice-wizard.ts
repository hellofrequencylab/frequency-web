// Vera's practice-claim wizard assist (ADR-116). A member is claiming a starter
// practice TEMPLATE and making it their own. Given the template plus the member's
// goal and realistic schedule, Vera personalizes the title, cadence, the concrete
// steps, and a one-line "why". Runs on Haiku (cheap); degrades to null when AI is
// off or the call fails, so the wizard always falls back to the template's own
// content. Mirrors lib/ai/connections-ai.ts (forced-tool structured output +
// usage ledger; never trust the raw shape — re-coerce every field).

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'

export interface PracticeSuggestion {
  title: string
  cadence: string
  steps: string[]
  why: string
}

const TOOL_NAME = 'personalize_practice'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return a personalized version of the practice for this member.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, motivating name for THEIR version (≤ 60 chars).' },
      cadence: {
        type: 'string',
        description: "How often, in their words, e.g. 'Daily', 'Weekday mornings', '3× a week'.",
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: '3–5 short, concrete steps tailored to their goal + schedule, in second person.',
      },
      why: {
        type: 'string',
        description: 'One warm sentence on why this version will work for them specifically.',
      },
    },
    required: ['title', 'cadence', 'steps', 'why'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, encouraging guide. A member is claiming a starter PRACTICE TEMPLATE and making it their own. Personalize it to THEM.

Rules:
- Keep the spirit of the template, but adapt the title, cadence, and steps to the member's stated goal and realistic schedule.
- steps: 3–5 short, concrete, doable actions in second person ("Lay your shoes by the door"). No fluff, no preamble.
- cadence: match what they can realistically sustain; undercommit rather than over-promise.
- title: a short, motivating name for their version.
- why: one genuine sentence on why this fits them. Never invent facts about them.
- Always call the personalize_practice tool.`

export async function personalizePractice(input: {
  template: { title: string; summary: string | null; body: string | null; cadence: string | null }
  goal: string
  schedule: string
  profileId?: string | null
}): Promise<PracticeSuggestion | null> {
  const client = getAnthropic()
  if (!client) return null
  const goal = input.goal.trim().slice(0, 1000)
  if (!goal) return null

  const t = input.template
  const userText = [
    'TEMPLATE',
    `Title: ${t.title}`,
    t.summary ? `Summary: ${t.summary}` : '',
    t.cadence ? `Suggested cadence: ${t.cadence}` : '',
    t.body ? `Guide:\n${t.body.slice(0, 1500)}` : '',
    '',
    'MEMBER',
    `Their goal: ${goal}`,
    input.schedule.trim() ? `Their realistic schedule: ${input.schedule.trim().slice(0, 300)}` : '',
    '',
    `Personalize this practice for them and call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await client.messages.create({
      model: MODELS.haiku,
      max_tokens: 700,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: 'practice-claim',
      model: MODELS.haiku,
      usage,
      costUsd: estimateCostUsd('haiku', usage),
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

function coerce(raw: unknown): PracticeSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : ''
  const cadence = typeof r.cadence === 'string' ? r.cadence.trim().slice(0, 40) : ''
  const why = typeof r.why === 'string' ? r.why.trim().slice(0, 200) : ''
  const steps = Array.isArray(r.steps)
    ? r.steps.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 6)
    : []
  if (!title || steps.length === 0) return null
  return { title, cadence: cadence || 'Daily', steps, why }
}
