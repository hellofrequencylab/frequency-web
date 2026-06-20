// Vera's "apply the change" editor (ADR-302). The author types a plain-language change ("make week 2
// about breathing", "swap the Spirit practice for gratitude", "shorten the intro"); Vera reads the
// whole Journey and returns a list of constrained EDIT OPERATIONS that the action applies in place.
// Forced-tool structured output + the voice primer; every op references an existing id we sent, and
// the action re-validates each id against the plan before applying. Degrades to null when AI is off.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { COMPOSE_PILLARS, type ComposePillar } from './journey-composition'

const FEATURE = 'journey-edit'

/** The Journey as Vera sees it for editing. */
export interface JourneyForEdit {
  title: string
  subtitle: string
  intro: string
  phases: {
    id: string
    title: string
    focus: string
    practices: { id: string; pillar: string; title: string; body: string }[]
  }[]
}

export type JourneyEditOp =
  | { op: 'identity'; title?: string; subtitle?: string; intro?: string }
  | { op: 'phase'; id: string; title?: string; focus?: string }
  | { op: 'practice'; id: string; title?: string; body?: string }
  | { op: 'add_practice'; phaseId: string; pillar: ComposePillar; title: string; body: string }
  | { op: 'remove'; id: string }

const TOOL_NAME = 'edit_journey'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return the minimal set of edits that satisfy the request, referencing existing ids.',
  input_schema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        description: 'The edits to apply, in order. Only what the request asks for; leave the rest alone.',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['identity', 'phase', 'practice', 'add_practice', 'remove'] },
            id: { type: 'string', description: 'For phase/practice/remove: the exact id of the item to change.' },
            phaseId: { type: 'string', description: 'For add_practice: the phase (week) id to add into.' },
            pillar: { type: 'string', enum: COMPOSE_PILLARS, description: 'For add_practice: which Pillar.' },
            title: { type: 'string', description: 'New title (identity title / phase title / practice name / new practice name).' },
            subtitle: { type: 'string', description: 'identity only: the one-line promise.' },
            intro: { type: 'string', description: 'identity only: the overview write-up.' },
            focus: { type: 'string', description: 'phase only: the week focus description.' },
            body: { type: 'string', description: 'practice / add_practice: the steps or note.' },
          },
          required: ['op'],
        },
      },
    },
    required: ['edits'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide, editing a Journey the author already built. The author will ask for a change in plain language. Return the SMALLEST set of edits that satisfy it and nothing else, using the ${TOOL_NAME} tool.

Rules:
- Only touch what the request asks for. Leave everything else exactly as it is.
- Reference items by the exact id given. Do not invent ids.
- Keep the four-Pillar balance and the gentle, doable tone. No hype, no emoji, no em dashes.
- Plain, specific, sentence case.`

export async function planJourneyEdits(input: {
  request: string
  journey: JourneyForEdit
  profileId?: string | null
}): Promise<JourneyEditOp[] | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): another Opus path. Over budget => return null, so the
  // action leaves the Journey untouched (no edits applied), never bill on.
  if (await featureOverBudget(FEATURE)) return null
  const request = input.request.trim().slice(0, 1000)
  if (!request) return null

  const j = input.journey
  const lines: string[] = [
    `Title: ${j.title}`,
    `Subtitle: ${j.subtitle || '(none)'}`,
    `Intro: ${j.intro || '(none)'}`,
    'Weeks:',
  ]
  for (const ph of j.phases) {
    lines.push(`- [${ph.id}] ${ph.title}${ph.focus ? ` — ${ph.focus}` : ''}`)
    for (const pr of ph.practices) {
      lines.push(`    - [${pr.id}] (${pr.pillar}) ${pr.title}${pr.body ? `: ${pr.body.slice(0, 120)}` : ''}`)
    }
  }
  const userText = `The Journey:\n${lines.join('\n')}\n\nThe change to make:\n${request}\n\nReturn the edits and call ${TOOL_NAME}.`

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 1500,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({ feature: FEATURE, model: MODELS.opus, usage: res.usage, costUsd: estimateCostUsd('opus', res.usage), profileId: input.profileId ?? null })
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME)
    return block ? coerce(block.input) : null
  } catch {
    return null
  }
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

function coerce(raw: unknown): JourneyEditOp[] {
  if (!raw || typeof raw !== 'object') return []
  const edits = (raw as { edits?: unknown }).edits
  if (!Array.isArray(edits)) return []
  const out: JourneyEditOp[] = []
  for (const e of edits.slice(0, 40)) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    switch (o.op) {
      case 'identity': {
        const title = str(o.title, 120)
        const subtitle = str(o.subtitle, 280)
        const intro = str(o.intro, 8000)
        if (title || subtitle || intro) out.push({ op: 'identity', title, subtitle, intro })
        break
      }
      case 'phase': {
        if (!id) break
        const title = str(o.title, 200)
        const focus = str(o.focus, 2000)
        if (title || focus) out.push({ op: 'phase', id, title, focus })
        break
      }
      case 'practice': {
        if (!id) break
        const title = str(o.title, 200)
        const body = str(o.body, 2000)
        if (title || body) out.push({ op: 'practice', id, title, body })
        break
      }
      case 'add_practice': {
        const phaseId = typeof o.phaseId === 'string' ? o.phaseId : ''
        const pillar = COMPOSE_PILLARS.includes(o.pillar as ComposePillar) ? (o.pillar as ComposePillar) : null
        const title = str(o.title, 200)
        if (phaseId && pillar && title) out.push({ op: 'add_practice', phaseId, pillar, title, body: str(o.body, 2000) ?? '' })
        break
      }
      case 'remove': {
        if (id) out.push({ op: 'remove', id })
        break
      }
    }
  }
  return out
}
