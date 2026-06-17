// Vera's "Spark" — the opening step of the guided Journey builder (ADR-302). From a few light
// onboarding answers (who it's for, what it's about, the outcome, how many weeks, the daily pace),
// Vera drafts the Journey's IDENTITY only: a title, a one-line promise, and a short overview. The
// arc (weekly Phases) and the four-Pillar practices are drafted in later steps. Mirrors
// lib/ai/journey-composition.ts: forced-tool structured output + the voice primer + the usage
// ledger, never trusting the raw shape. Degrades to null when AI is off (the wizard then lets the
// author type the identity by hand).

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'

export type JourneyPace = 'light' | 'medium'

export interface SparkAnswers {
  /** Who the Journey is for. */
  who: string
  /** What it's about — a topic, or general wellbeing. */
  topic: string
  /** What people should walk away with. */
  outcome: string
  /** How many weeks (one weekly Phase each). */
  weeks: number
  /** Roughly how much time a day. */
  pace: JourneyPace
}

export interface JourneySpark {
  title: string
  /** One line, leading with the outcome. */
  promise: string
  /** A short, warm paragraph. */
  overview: string
}

const TOOL_NAME = 'draft_journey_spark'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Return the Journey's identity: a title, a one-line promise, and a short overview.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, plain, evocative name (<= 60 chars). Title case.' },
      promise: { type: 'string', description: 'One line that leads with the outcome, plain, no hype (<= 140 chars).' },
      overview: { type: 'string', description: 'Two to four short sentences on what this is and who it is for. Lead with the problem or feeling.' },
    },
    required: ['title', 'promise', 'overview'],
  },
}

const SYSTEM = `You are Vera, Frequency's guide: warm, grounded, and practical, a camp counselor you actually respect, not a guru and not a hype machine. An author answered a few questions about a Journey they want to build. A Journey is a themed path of small daily practices a Circle travels together, balanced underneath across four Pillars (Mind, Body, Spirit, Expression).

Draft the Journey's IDENTITY only (not the practices yet): a title, a one-line promise that leads with the outcome, and a short overview.

How to write:
- Plain language, short sentences. Lead with the problem or the feeling.
- Specific and honest. Never promise transformation.
- No jargon, no mysticism, no emoji, no em dashes.
- Always call the ${TOOL_NAME} tool.`

export async function draftJourneySpark(input: SparkAnswers & { profileId?: string | null }): Promise<JourneySpark | null> {
  const client = getAnthropic()
  if (!client) return null

  const userText = [
    `Who it is for: ${input.who.trim().slice(0, 400) || 'anyone'}`,
    `What it is about: ${input.topic.trim().slice(0, 400) || 'general wellbeing'}`,
    `What they walk away with: ${input.outcome.trim().slice(0, 400) || 'a steadier week'}`,
    `Length: ${input.weeks} ${input.weeks === 1 ? 'week' : 'weeks'}`,
    `Time a day: ${input.pace}`,
    '',
    `Draft the identity and call ${TOOL_NAME}.`,
  ].join('\n')

  try {
    const res = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 600,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: 'journey-spark',
      model: MODELS.opus,
      usage,
      costUsd: estimateCostUsd('opus', usage),
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

function coerce(raw: unknown): JourneySpark | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : ''
  const promise = typeof r.promise === 'string' ? r.promise.trim().slice(0, 200) : ''
  const overview = typeof r.overview === 'string' ? r.overview.trim().slice(0, 1200) : ''
  if (!title) return null
  return { title, promise, overview }
}
