// Vera's "apply the change" editor for the Practice builder (mirrors lib/ai/journey-edit.ts,
// ADR-358). The author types a plain-language change ("make it gentler", "shorten the steps",
// "rewrite the hook for someone who can't switch off"); Vera reads the whole Practice and returns a
// constrained set of NEW FIELD VALUES that the action applies in place. A Practice is one atom (no
// block tree), so the edit is a small patch over its fields, not a list of ops over children.
// Forced-tool structured output + the voice primer; the action re-validates and bounds every field
// before saving. Degrades to null when AI is off.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { withPracticeShape } from './practice-shape'

const FEATURE = 'practice-edit'

/** The Practice as Vera sees it for editing. */
export interface PracticeForEdit {
  title: string
  /** The card hook. */
  summary: string
  /** The one-line description. */
  description: string
  /** The full guide (steps). */
  body: string
  cadence: string
}

/** The fields Vera may rewrite. Every field optional: only what the request asks for is returned. */
export interface PracticeEditDraft {
  title?: string
  summary?: string
  description?: string
  body?: string
  cadence?: string
}

const TOOL_NAME = 'edit_practice'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return only the fields that the request changes, rewritten. Leave the rest out.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'New name, only if the request changes it.' },
      summary: { type: 'string', description: 'New card hook (8 to 12 words), only if the request changes it.' },
      description: { type: 'string', description: 'New one-line description, only if the request changes it.' },
      body: { type: 'string', description: 'New full guide (the steps + why), only if the request changes it.' },
      cadence: { type: 'string', enum: ['Daily', 'A few times a week', 'Weekly'], description: 'New cadence, only if the request changes it.' },
    },
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide, editing a Practice the author already built. The author will ask for a change in plain language. Return ONLY the fields the request changes, rewritten, using the ${TOOL_NAME} tool. Leave every field the request does not touch out of your answer entirely.

Rules:
- Change only what the request asks for. Do not rewrite the whole Practice when they ask for one tweak.
- Keep it a small, doable, single act. The guide stays three to six concrete steps in second person.
- Plain, specific, sentence case. No hype, no emoji, no em dashes. Never narrate the reader's feelings. Never use the word "Mission".`

export async function planPracticeEdits(input: {
  request: string
  practice: PracticeForEdit
  profileId?: string | null
}): Promise<PracticeEditDraft | null> {
  if (!aiEnabled()) return null
  // Per-feature daily cap (lib/ai/budget.ts): another Opus path. Over budget => return null, so the
  // action leaves the Practice untouched, never bill on.
  if (await featureOverBudget(FEATURE)) return null
  const request = input.request.trim().slice(0, 1000)
  if (!request) return null

  const p = input.practice
  const userText = [
    'The Practice:',
    `Name: ${p.title}`,
    `Hook: ${p.summary || '(none)'}`,
    `Description: ${p.description || '(none)'}`,
    `Cadence: ${p.cadence || '(none)'}`,
    `Guide:\n${p.body || '(none)'}`,
    '',
    `The change to make:\n${request}`,
    '',
    `Return the changed fields and call ${TOOL_NAME}.`,
  ].join('\n')

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 1200,
      thinking: { type: 'disabled' },
      system: withVoice(withPracticeShape(SYSTEM)),
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
    return block ? coerce(block.input) : null
  } catch {
    return null
  }
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

function coerce(raw: unknown): PracticeEditDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: PracticeEditDraft = {}
  const title = str(r.title, 80)
  const summary = str(r.summary, 140)
  const description = str(r.description, 280)
  const body = str(r.body, 8000)
  const cadenceRaw = str(r.cadence, 40)
  const cadence = cadenceRaw && ['Daily', 'A few times a week', 'Weekly'].includes(cadenceRaw) ? cadenceRaw : undefined
  if (title) out.title = title
  if (summary) out.summary = summary
  if (description) out.description = description
  if (body) out.body = body
  if (cadence) out.cadence = cadence
  return Object.keys(out).length ? out : null
}
