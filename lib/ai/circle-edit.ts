// Vera's "apply the change" editor for a Circle. The Host types a plain-language
// change ("make the Meetup biweekly", "more beginner-friendly", "shorten the
// Card"); Vera reads the whole Circle and returns the SMALLEST patch of framework
// fields to change. Mirrors lib/ai/journey-edit.ts, but a Circle is flat fields
// (no tree), so the result is a partial patch the builder applies in place.
// Forced-tool structured output + the voice primer; null when AI is off.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import type { PillarSlug } from '@/lib/pillars'
import type { CircleSparkDraft } from './circle-spark'

const FEATURE = 'circle-edit'
const PILLARS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

/** The Circle as Vera sees it for editing (the framework fields, all optional so
 *  a partial draft can still be edited). */
export type CircleForEdit = Partial<
  Pick<
    CircleSparkDraft,
    | 'name'
    | 'card'
    | 'oneLiner'
    | 'identity'
    | 'audience'
    | 'pillarsInside'
    | 'meetup'
    | 'gathering'
    | 'thread'
    | 'format'
    | 'sizeLabel'
    | 'agreements'
    | 'remixOptions'
  >
> & { name: string }

/** The minimal change to apply: only the fields Vera touched. */
export type CircleEditPatch = Partial<
  Pick<
    CircleSparkDraft,
    | 'name'
    | 'card'
    | 'oneLiner'
    | 'identity'
    | 'audience'
    | 'pillarsInside'
    | 'meetup'
    | 'gathering'
    | 'thread'
    | 'format'
    | 'sizeLabel'
    | 'agreements'
    | 'remixOptions'
  >
>

const TOOL_NAME = 'edit_circle'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return only the fields that change to satisfy the request. Leave the rest out.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      card: { type: 'string', description: 'The skeptic-proof hook, under a dozen words.' },
      one_liner: { type: 'string', description: 'About 25 words.' },
      identity: { type: 'string' },
      audience: { type: 'string' },
      pillars_inside: {
        type: 'object',
        properties: {
          mind: { type: 'string' },
          body: { type: 'string' },
          spirit: { type: 'string' },
          expression: { type: 'string' },
        },
      },
      meetup: { type: 'string', description: 'The standing midweek Circle Meetup.' },
      gathering: { type: 'string', description: 'The standing Weekend Gathering.' },
      thread: { type: 'string', description: 'The always-on online Thread.' },
      format: { type: 'string', description: 'In person / virtual / hybrid guidance.' },
      size_label: { type: 'string', description: 'The headcount that makes it work, e.g. "5 to 10".' },
      agreements: { type: 'array', items: { type: 'string' } },
      remix_options: { type: 'array', items: { type: 'string' } },
    },
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide, editing a Circle the Host already built. The Host will ask for a change in plain language. Return the SMALLEST patch that satisfies it and nothing else, using the ${TOOL_NAME} tool.

Rules:
- Only include fields you are actually changing. Leave everything else out (do not echo unchanged fields).
- Keep the Circle coherent: it leans one Pillar, carries all four inside, and runs a midweek Meetup, a Weekend Gathering, and the Thread. In person is the default; always keep a virtual path.
- Keep the Card skeptic-proof. Plain, specific, sentence case. No hype, no emoji, no em dashes.
- Never invent a specific place, day, or fact you were not given.`

export async function planCircleEdit(input: {
  request: string
  circle: CircleForEdit
  profileId?: string | null
}): Promise<CircleEditPatch | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(FEATURE)) return null
  const request = input.request.trim().slice(0, 1000)
  if (!request) return null

  const c = input.circle
  const pi = c.pillarsInside ?? {}
  const lines: string[] = [
    `Name: ${c.name}`,
    `Card: ${c.card || '(none)'}`,
    `One-liner: ${c.oneLiner || '(none)'}`,
    `Identity: ${c.identity || '(none)'}`,
    `Who it is for: ${c.audience || '(none)'}`,
    `Pillars inside: ${PILLARS.map((p) => `${p}=${pi[p] ?? '-'}`).join(' | ')}`,
    `Meetup: ${c.meetup || '(none)'}`,
    `Gathering: ${c.gathering || '(none)'}`,
    `Thread: ${c.thread || '(none)'}`,
    `Format: ${c.format || '(none)'}`,
    `Size: ${c.sizeLabel || '(none)'}`,
    `Agreements: ${(c.agreements ?? []).join('; ') || '(none)'}`,
    `Remix ideas: ${(c.remixOptions ?? []).join('; ') || '(none)'}`,
  ]
  const userText = `The Circle:\n${lines.join('\n')}\n\nThe change to make:\n${request}\n\nReturn only what changes and call ${TOOL_NAME}.`

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 1200,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
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
function strArray(v: unknown, max: number, cap: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, max)).filter(Boolean).slice(0, cap)
  return out.length ? out : undefined
}

function coerce(raw: unknown): CircleEditPatch {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const patch: CircleEditPatch = {}

  const name = str(r.name, 60)
  if (name) patch.name = name.replace(/^["']+|["']+$/g, '')
  const card = str(r.card, 100)
  if (card) patch.card = card
  const oneLiner = str(r.one_liner, 280)
  if (oneLiner) patch.oneLiner = oneLiner
  const identity = str(r.identity, 280)
  if (identity) patch.identity = identity
  const audience = str(r.audience, 280)
  if (audience) patch.audience = audience
  const meetup = str(r.meetup, 600)
  if (meetup) patch.meetup = meetup
  const gathering = str(r.gathering, 600)
  if (gathering) patch.gathering = gathering
  const thread = str(r.thread, 400)
  if (thread) patch.thread = thread
  const format = str(r.format, 400)
  if (format) patch.format = format
  const sizeLabel = str(r.size_label, 60)
  if (sizeLabel) patch.sizeLabel = sizeLabel

  const agreements = strArray(r.agreements, 160, 5)
  if (agreements) patch.agreements = agreements
  const remixOptions = strArray(r.remix_options, 160, 8)
  if (remixOptions) patch.remixOptions = remixOptions

  if (r.pillars_inside && typeof r.pillars_inside === 'object') {
    const pi = r.pillars_inside as Record<string, unknown>
    const pillarsInside: Partial<Record<PillarSlug, string>> = {}
    for (const p of PILLARS) {
      const line = str(pi[p], 240)
      if (line) pillarsInside[p] = line
    }
    if (Object.keys(pillarsInside).length) patch.pillarsInside = pillarsInside
  }

  return patch
}
