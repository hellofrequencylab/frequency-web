// Vera's "build my Journey" composer for the course builder (JOURNEYS.md §6). From a one-line
// description, Vera drafts a balanced week: the three weekly practices (Mind, Body, Spirit) plus a
// weekly Expression Challenge (the Expression Pillar's active, social, light doing), each picked
// from the library or freshly written. The three practices COMPLEMENT the week's Anchor (the daily
// through-line) instead of repeating it, and the week can reach back to a prior-week summary, so the
// composition tracks the Master Journey Template. So a fresh Journey opens balanced across all four
// Pillars, and doing the practices feeds the four-Pillar Signature. Mirrors lib/ai/journey-outline.ts:
// forced-tool structured output + the voice + Journey-shape primers + the usage ledger; never trust
// the raw shape, and every library id is re-validated against the candidates we sent. Degrades to
// null when AI is off, so the builder falls back to an empty shape.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { withJourneyShape } from './journey-shape'

const FEATURE = 'journey-composition'

export type ComposePillar = 'mind' | 'body' | 'spirit' | 'expression'
export const COMPOSE_PILLARS: ComposePillar[] = ['mind', 'body', 'spirit', 'expression']

/** A candidate library practice offered to Vera for one Pillar. Carries the shape she needs to
 *  pick well: the hook (summary), how often it's done (cadence), and how long (durationMin). */
export interface ComposeCandidate {
  id: string
  title: string
  summary: string | null
  /** How often it's done, e.g. 'Daily', '3x/week', 'Weekly'. */
  cadence?: string | null
  /** Typical session length in minutes. */
  durationMin?: number | null
}

/** One filled Pillar slot: either a library pick (by id) or a freshly written practice/activity. */
export type ComposedPractice =
  | { pillar: ComposePillar; mode: 'library'; practiceId: string }
  | { pillar: ComposePillar; mode: 'create'; title: string; body: string }

/** An above-and-beyond extra-credit Challenge (ADR-300 Part 2): a harder, optional bonus task. */
export interface ComposedExtraCredit {
  title: string
  body: string
}

export interface JourneyComposition {
  /** A refined Journey name, if Vera suggested one. */
  title: string | null
  /** One slot per Pillar (Mind/Body/Spirit/Expression), in Pillar order. */
  practices: ComposedPractice[]
  /** One optional extra-credit Challenge to seed (bonus task, pays regular Zaps), else null. */
  extraCredit: ComposedExtraCredit | null
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
            title: { type: 'string', description: 'When mode=create: a short, plain practice name.' },
            body: { type: 'string', description: 'When mode=create: 2 to 4 short, concrete steps in second person.' },
          },
          required: ['pillar', 'mode'],
        },
      },
      extra_credit: {
        type: 'object',
        description: 'One optional extra-credit challenge: a harder, above-and-beyond bonus task.',
        properties: {
          title: { type: 'string', description: 'A short, concrete challenge name.' },
          body: { type: 'string', description: 'One or two plain sentences on what to do and how to know it is done.' },
        },
        required: ['title', 'body'],
      },
    },
    required: ['practices'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. An author is building a Journey: a short group-coaching program a Circle moves through together. From their description, compose a balanced week with one slot for each of the four Pillars.

Rules:
- Exactly four slots: Mind, Body, Spirit, and Expression. For each, prefer reusing a fitting practice from the candidates listed for that Pillar (mode=library, return its exact id). Only write a new one (mode=create) when no candidate fits; then give a short title and 2 to 4 concrete steps in second person.
- Mind, Body, and Spirit are the three weekly practices. They COMPLEMENT the week's Anchor practice (the small daily through-line), they do not repeat it. If an Anchor is given below, pick practices that add to it rather than restate it.
- The Expression slot is the week's EXPRESSION CHALLENGE: the Expression Pillar's active, social doing. Keep the weekly one LIGHT and tangible: make something small, share it, or connect with one person. Small and doable, like the others.
- Also include ONE extra-credit challenge: a harder, optional, above-and-beyond task that stretches the member a little. A short name + one or two plain sentences. It is a bonus, not one of the four slots.
- If a prior-week summary is given below, let this week reach back to it: build on where the last week left off instead of starting fresh.
- Plain, specific, sentence case. No hype, no emoji, no em dashes. Never narrate the reader's feelings. Never use the word "Mission".
- Never invent a library id that was not listed. Always call the ${TOOL_NAME} tool.`

export async function draftJourneyComposition(input: {
  description: string
  /** Candidate library practices per Pillar, for Vera to pick from. */
  library: Record<ComposePillar, ComposeCandidate[]>
  profileId?: string | null
  /** OPTIONAL. A short recap of the previous week, so this week can reach back to it instead of
   *  starting fresh. Omit (or leave empty) for the opening week. */
  priorWeekSummary?: string
  /** OPTIONAL. The week's Anchor practice (the small daily through-line). When given, Vera composes
   *  the Mind/Body/Spirit slots to COMPLEMENT it rather than duplicate it. */
  anchorTitle?: string
}): Promise<JourneyComposition | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): this is an Opus path, so a hard ceiling matters most
  // here. Over budget => fall back to the empty shape, never bill on.
  if (await featureOverBudget(FEATURE)) return null
  // Roomy cap: the description can carry the author's uploaded course outline (ADR-302), which we
  // want Vera to read in full rather than truncate to a couple of sentences.
  const description = input.description.trim().slice(0, 8000)
  if (!description) return null

  // Optional week context. Safe defaults: when neither is given the prompt reads exactly as the
  // opening-week composer always did, so the existing caller keeps working unchanged.
  const anchorTitle = input.anchorTitle?.trim().slice(0, 200) ?? ''
  const priorWeekSummary = input.priorWeekSummary?.trim().slice(0, 1000) ?? ''
  const contextLines = [
    anchorTitle
      ? `This week's Anchor practice (the daily through-line): ${anchorTitle}\nCompose the Mind, Body, and Spirit slots to COMPLEMENT this Anchor, not repeat it.`
      : '',
    priorWeekSummary
      ? `Previous week, to reach back to:\n${priorWeekSummary}\nLet this week build on it.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  // Candidate lists per Pillar, in the prompt (ids Vera may reference for mode=library). Each
  // line carries the hook + cadence + length so Vera can match the right practice to the brief.
  const candidateText = COMPOSE_PILLARS.map((p) => {
    const rows = (input.library[p] ?? []).slice(0, 12)
    const lines = rows.length
      ? rows
          .map((c) => {
            const meta = [c.cadence?.trim(), c.durationMin != null ? `${c.durationMin} min` : null]
              .filter(Boolean)
              .join(', ')
            return `  - id=${c.id} · ${c.title}${c.summary ? ` — ${c.summary.slice(0, 80)}` : ''}${meta ? ` (${meta})` : ''}`
          })
          .join('\n')
      : '  (none yet — write a new one)'
    return `${p.toUpperCase()} candidates:\n${lines}`
  }).join('\n\n')

  // The set of ids we actually offered, per Pillar — used to reject any hallucinated id.
  const allowed = {} as Record<ComposePillar, Set<string>>
  for (const p of COMPOSE_PILLARS) allowed[p] = new Set((input.library[p] ?? []).map((c) => c.id))

  const userText = [
    `Journey description:\n${description}`,
    contextLines,
    candidateText,
    `Compose the week and call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 1500,
      thinking: { type: 'disabled' },
      system: withVoice(withJourneyShape(SYSTEM)),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS.opus,
      usage: res.usage,
      costUsd: estimateCostUsd('opus', res.usage),
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

  let extraCredit: ComposedExtraCredit | null = null
  if (r.extra_credit && typeof r.extra_credit === 'object') {
    const ec = r.extra_credit as Record<string, unknown>
    const ectitle = typeof ec.title === 'string' ? ec.title.trim().slice(0, 120) : ''
    const ecbody = typeof ec.body === 'string' ? ec.body.trim().slice(0, 600) : ''
    if (ectitle) extraCredit = { title: ectitle, body: ecbody }
  }

  return { title, practices, extraCredit }
}
