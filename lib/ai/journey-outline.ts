// Vera's "draft my outline" assist for the Journey editor (build item §11.1 #4, JOURNEYS.md §6).
// Given an author's one-line description, Vera drafts a Phase -> Lesson skeleton (the structure,
// not the full content) so the blank page is never the starting point. Mirrors the house wizard
// pattern (lib/ai/practice-wizard.ts): forced-tool structured output + the voice primer + the
// usage ledger; never trust the raw shape — coerce every field. Degrades to null when AI is off
// or the call fails, so the editor falls back to building by hand.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'

export type OutlineLessonType = 'reading' | 'reflection' | 'exercise' | 'check'
const LESSON_TYPES: OutlineLessonType[] = ['reading', 'reflection', 'exercise', 'check']

export interface OutlineLesson {
  type: OutlineLessonType
  title: string
}
export interface OutlinePhase {
  title: string
  lessons: OutlineLesson[]
}
export interface JourneyOutline {
  title: string
  summary: string
  phases: OutlinePhase[]
}

const TOOL_NAME = 'draft_journey_outline'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return a Phase -> Lesson outline for the Journey the author described.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, evocative name for the whole Journey (<= 60 chars).' },
      summary: { type: 'string', description: "One sentence on what the learner will be able to do by the end." },
      phases: {
        type: 'array',
        description: '3 to 4 weekly Phases.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A short, concrete Phase title (e.g. "Week 1 · Notice the noise").' },
            lessons: {
              type: 'array',
              description: '2 to 4 lessons.',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: LESSON_TYPES, description: 'The lesson kind.' },
                  title: { type: 'string', description: 'A short, specific lesson title.' },
                },
                required: ['type', 'title'],
              },
            },
          },
          required: ['title', 'lessons'],
        },
      },
    },
    required: ['title', 'summary', 'phases'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. An author wants to build a Journey: a short, group-coaching program a Circle moves through together, organized into weekly Phases of bite-sized lessons. From their description, draft a clear, doable outline.

Rules:
- 3 to 4 Phases, each a weekly milestone with a short, concrete title (for example "Week 1 · Notice the noise").
- 2 to 4 lessons per Phase. Lead each Phase with a reading.
- Lesson types: reading (a short read), reflection (a journaling prompt), exercise (a small real task), check (a quick knowledge check). Mix them.
- Titles are plain, specific, sentence case. No hype, no emoji, no em dashes.
- title: a short, evocative name for the whole Journey. summary: one sentence on what they will be able to do by the end.
- Never invent facts about the author or audience. Always call the ${TOOL_NAME} tool.`

export async function draftJourneyOutline(input: {
  description: string
  profileId?: string | null
}): Promise<JourneyOutline | null> {
  const client = getAnthropic()
  if (!client) return null
  const description = input.description.trim().slice(0, 2000)
  if (!description) return null

  try {
    const res = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: `Draft a Journey outline from this description and call ${TOOL_NAME}:\n\n${description}` }],
    })
    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: 'journey-outline',
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

function coerce(raw: unknown): JourneyOutline | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 80) : ''
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 200) : ''
  const phases: OutlinePhase[] = Array.isArray(r.phases)
    ? r.phases
        .map((p): OutlinePhase | null => {
          if (!p || typeof p !== 'object') return null
          const pr = p as Record<string, unknown>
          const ptitle = typeof pr.title === 'string' ? pr.title.trim().slice(0, 120) : ''
          const lessons: OutlineLesson[] = Array.isArray(pr.lessons)
            ? pr.lessons
                .map((l): OutlineLesson | null => {
                  if (!l || typeof l !== 'object') return null
                  const lr = l as Record<string, unknown>
                  const ltitle = typeof lr.title === 'string' ? lr.title.trim().slice(0, 120) : ''
                  const type = LESSON_TYPES.includes(lr.type as OutlineLessonType) ? (lr.type as OutlineLessonType) : 'reading'
                  return ltitle ? { type, title: ltitle } : null
                })
                .filter((l): l is OutlineLesson => !!l)
                .slice(0, 6)
            : []
          return ptitle && lessons.length > 0 ? { title: ptitle, lessons } : null
        })
        .filter((p): p is OutlinePhase => !!p)
        .slice(0, 6)
    : []
  if (!title || phases.length === 0) return null
  return { title, summary, phases }
}
