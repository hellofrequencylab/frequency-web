// Vera's "build my Journey" composer for the course builder (JOURNEYS.md §6). From a one-line
// description, Vera drafts a balanced opening week: one slot per Pillar — a Mind, Body, and Spirit
// practice (picked from the library or freshly written) and an Expression slot written as a short,
// fun challenge-style activity that puts the week to work. So a fresh Journey opens balanced across
// all four Pillars. Mirrors lib/ai/journey-outline.ts: forced-tool structured output + the voice
// primer + the usage ledger; never trust the raw shape, and every library id is re-validated against
// the candidates we sent. Degrades to null when AI is off, so the builder falls back to an empty shape.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'

export type ComposePillar = 'mind' | 'body' | 'spirit' | 'expression'
export const COMPOSE_PILLARS: ComposePillar[] = ['mind', 'body', 'spirit', 'expression']

/** A candidate library practice offered to Vera for one Pillar. */
export interface ComposeCandidate {
  id: string
  title: string
  summary: string | null
}

/** One filled Pillar slot: either a library pick (by id) or a freshly written practice/activity. */
export type ComposedPractice =
  | { pillar: ComposePillar; mode: 'library'; practiceId: string }
  | { pillar: ComposePillar; mode: 'create'; title: string; body: string }

export interface JourneyComposition {
  /** A refined Journey name, if Vera suggested one. */
  title: string | null
  /** One slot per Pillar (Mind/Body/Spirit/Expression), in Pillar order. */
  practices: ComposedPractice[]
}

const TOOL_NAME = 'compose_journey'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return a balanced opening week: one slot for each Pillar (Mind, Body, Spirit, Expression).',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'An optional short, evocative name for the Journey (<= 60 chars).' },
      practices: {
        type: 'array',
        description: 'Exactly four slots: one each for mind, body, spirit, and expression.',
        items: {
          type: 'object',
          properties: {
            pillar: { type: 'string', enum: COMPOSE_PILLARS, description: 'Which Pillar this slot covers.' },
            mode: {
              type: 'string',
              enum: ['library', 'create'],
              description: 'library = reuse one of the candidate practices listed for this Pillar; create = write a new one.',
            },
            practiceId: { type: 'string', description: 'When mode=library: the exact id of a candidate practice for this Pillar.' },
            title: { type: 'string', description: 'When mode=create: a short, plain name. For expression, a short fun challenge name.' },
            body: { type: 'string', description: 'When mode=create: 2 to 4 short steps in second person. For expression, what to make/share/do.' },
          },
          required: ['pillar', 'mode'],
        },
      },
    },
    required: ['practices'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. An author is building a Journey: a short group-coaching program a Circle moves through together. From their description, compose a balanced opening week with one slot for each of the four Pillars.

Rules:
- Exactly four slots: Mind, Body, Spirit, and Expression.
- Mind, Body, Spirit are quiet practices. For each, prefer reusing a fitting practice from the candidates listed for that Pillar (mode=library, return its exact id). Only write a new one (mode=create) when no candidate fits; then give a short title and 2 to 4 concrete steps in second person.
- Expression is how they put the week to work: write it (mode=create) as a short, fun challenge-style activity. Make something, share something, or do something out loud. Give it a short name and one or two plain sentences on what to do.
- Plain, specific, sentence case. No hype, no emoji, no em dashes. Never narrate the reader's feelings.
- Never invent a library id that was not listed. Always call the ${TOOL_NAME} tool.`

export async function draftJourneyComposition(input: {
  description: string
  /** Candidate library practices per Pillar, for Vera to pick from. */
  library: Record<ComposePillar, ComposeCandidate[]>
  profileId?: string | null
}): Promise<JourneyComposition | null> {
  const client = getAnthropic()
  if (!client) return null
  const description = input.description.trim().slice(0, 2000)
  if (!description) return null

  // Candidate lists per Pillar, in the prompt (ids Vera may reference for mode=library).
  const candidateText = COMPOSE_PILLARS.map((p) => {
    const rows = (input.library[p] ?? []).slice(0, 12)
    const lines = rows.length
      ? rows.map((c) => `  - id=${c.id} · ${c.title}${c.summary ? ` — ${c.summary.slice(0, 80)}` : ''}`).join('\n')
      : '  (none yet — write a new one)'
    return `${p.toUpperCase()} candidates:\n${lines}`
  }).join('\n\n')

  // The set of ids we actually offered, per Pillar — used to reject any hallucinated id.
  const allowed = {} as Record<ComposePillar, Set<string>>
  for (const p of COMPOSE_PILLARS) allowed[p] = new Set((input.library[p] ?? []).map((c) => c.id))

  const userText = `Journey description:\n${description}\n\n${candidateText}\n\nCompose the opening week and call ${TOOL_NAME}.`

  try {
    const res = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 1500,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: 'journey-composition',
      model: MODELS.opus,
      usage,
      costUsd: estimateCostUsd('opus', usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    return block ? coerce(block.input, allowed) : null
  } catch {
    return null
  }
}

function coerce(raw: unknown, allowed: Record<ComposePillar, Set<string>>): JourneyComposition | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 80) : null

  const byPillar = new Map<ComposePillar, ComposedPractice>()
  if (Array.isArray(r.practices)) {
    for (const p of r.practices) {
      if (!p || typeof p !== 'object') continue
      const pr = p as Record<string, unknown>
      const pillar = COMPOSE_PILLARS.includes(pr.pillar as ComposePillar) ? (pr.pillar as ComposePillar) : null
      if (!pillar || byPillar.has(pillar)) continue
      if (pr.mode === 'library') {
        const id = typeof pr.practiceId === 'string' ? pr.practiceId : ''
        if (id && allowed[pillar].has(id)) byPillar.set(pillar, { pillar, mode: 'library', practiceId: id })
      } else {
        const ptitle = typeof pr.title === 'string' ? pr.title.trim().slice(0, 80) : ''
        const body = typeof pr.body === 'string' ? pr.body.trim().slice(0, 2000) : ''
        if (ptitle) byPillar.set(pillar, { pillar, mode: 'create', title: ptitle, body })
      }
    }
  }
  // Keep Pillar order (mind, body, spirit, expression); only the slots Vera filled validly.
  const practices = COMPOSE_PILLARS.map((p) => byPillar.get(p)).filter((s): s is ComposedPractice => !!s)
  if (practices.length === 0) return null
  return { title, practices }
}
