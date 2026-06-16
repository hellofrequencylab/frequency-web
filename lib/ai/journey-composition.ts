// Vera's "build my Journey" composer for the course builder (JOURNEYS.md §6). From a one-line
// description, Vera drafts a balanced opening week: one Practice each for Mind, Body, and Spirit
// (either picked from the member's library or freshly written) plus two challenges. Mirrors
// lib/ai/journey-outline.ts: forced-tool structured output + the voice primer + the usage ledger;
// never trust the raw shape, and every library id is re-validated against the candidates we sent.
// Degrades to null when AI is off or the call fails, so the builder falls back to an empty scaffold.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'

export type ComposePillar = 'mind' | 'body' | 'spirit'
export const COMPOSE_PILLARS: ComposePillar[] = ['mind', 'body', 'spirit']

/** A candidate library practice offered to Vera for one Pillar. */
export interface ComposeCandidate {
  id: string
  title: string
  summary: string | null
}

/** One filled practice slot: either a library pick (by id) or a freshly written practice. */
export type ComposedPractice =
  | { pillar: ComposePillar; mode: 'library'; practiceId: string }
  | { pillar: ComposePillar; mode: 'create'; title: string; body: string }

export interface ComposedChallenge {
  title: string
  body: string
}

export interface JourneyComposition {
  /** A refined Journey name, if Vera suggested one. */
  title: string | null
  practices: ComposedPractice[]
  challenges: ComposedChallenge[]
}

const TOOL_NAME = 'compose_journey'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return a balanced opening week: a Mind, Body, and Spirit practice plus two challenges.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'An optional short, evocative name for the Journey (<= 60 chars).' },
      practices: {
        type: 'array',
        description: 'Exactly three practices: one for mind, one for body, one for spirit.',
        items: {
          type: 'object',
          properties: {
            pillar: { type: 'string', enum: COMPOSE_PILLARS, description: 'Which Pillar this practice covers.' },
            mode: {
              type: 'string',
              enum: ['library', 'create'],
              description: 'library = reuse one of the candidate practices listed for this Pillar; create = write a new one.',
            },
            practiceId: { type: 'string', description: 'When mode=library: the exact id of a candidate practice for this Pillar.' },
            title: { type: 'string', description: 'When mode=create: a short, plain practice name.' },
            body: { type: 'string', description: 'When mode=create: 2 to 4 short steps for doing it, in second person.' },
          },
          required: ['pillar', 'mode'],
        },
      },
      challenges: {
        type: 'array',
        description: 'Exactly two challenges: small, concrete real-world tasks that stretch the member a little.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'A short, concrete challenge name.' },
            body: { type: 'string', description: 'One or two plain sentences on what to do and how to know it is done.' },
          },
          required: ['title', 'body'],
        },
      },
    },
    required: ['practices', 'challenges'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. An author is building a Journey: a short group-coaching program a Circle moves through together. From their description, compose a balanced opening week.

Rules:
- Exactly three practices: one for Mind, one for Body, one for Spirit. For each, prefer reusing a fitting practice from the candidates listed for that Pillar (mode=library, return its exact id). Only write a new one (mode=create) when no candidate fits; then give a short title and 2 to 4 concrete steps in second person.
- Exactly two challenges: small, concrete real-world tasks (not lessons) that stretch the member a little, each with a short title and one or two plain sentences.
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
  const allowed: Record<ComposePillar, Set<string>> = {
    mind: new Set((input.library.mind ?? []).map((c) => c.id)),
    body: new Set((input.library.body ?? []).map((c) => c.id)),
    spirit: new Set((input.library.spirit ?? []).map((c) => c.id)),
  }

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
  // Keep Pillar order (mind, body, spirit); only the slots Vera filled validly.
  const practices = COMPOSE_PILLARS.map((p) => byPillar.get(p)).filter((s): s is ComposedPractice => !!s)

  const challenges: ComposedChallenge[] = Array.isArray(r.challenges)
    ? r.challenges
        .map((c): ComposedChallenge | null => {
          if (!c || typeof c !== 'object') return null
          const cr = c as Record<string, unknown>
          const ctitle = typeof cr.title === 'string' ? cr.title.trim().slice(0, 120) : ''
          const body = typeof cr.body === 'string' ? cr.body.trim().slice(0, 600) : ''
          return ctitle ? { title: ctitle, body } : null
        })
        .filter((c): c is ComposedChallenge => !!c)
        .slice(0, 2)
    : []

  if (practices.length === 0 && challenges.length === 0) return null
  return { title, practices, challenges }
}
