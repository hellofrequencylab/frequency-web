// Vera's "compose a section" for the Circle builder. Given the Circle so far and
// which section to fill (the four Pillars inside, the agreements, the rhythm, the
// Card, the remix ideas, the Thread), Vera drafts just that section. Mirrors
// lib/ai/circle-spark.ts: forced-tool structured output + the voice primer + the
// usage ledger. Returns only the requested section's fields, or null when AI is
// off. The builder applies the partial in place.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import type { PillarSlug } from '@/lib/pillars'
import type { CircleSparkDraft } from './circle-spark'

const FEATURE = 'circle-compose'
const TIER = 'sonnet' as const
const PILLARS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

export type CircleComposeSection = 'pillars' | 'agreements' | 'remix' | 'rhythm' | 'card' | 'thread'

/** What Vera knows about the Circle so far, to ground the section it drafts. */
export interface CircleComposeContext {
  name: string
  primaryPillar: PillarSlug | null
  topic?: string
  audience?: string
  identity?: string
}

export type CircleComposeResult = Partial<
  Pick<CircleSparkDraft, 'card' | 'oneLiner' | 'pillarsInside' | 'agreements' | 'remixOptions' | 'meetup' | 'gathering' | 'thread'>
>

const SECTION_ASK: Record<CircleComposeSection, string> = {
  pillars: 'Fill ONLY pillars_inside: one concrete line each for Mind, Body, Spirit, and Expression.',
  agreements: 'Fill ONLY agreements: three or four plain norms, stated once.',
  remix: 'Fill ONLY remix_options: a few variations a Host could run instead, to make it theirs.',
  rhythm: 'Fill ONLY meetup and gathering: the standing midweek Circle Meetup and the Weekend Gathering.',
  card: 'Fill ONLY card and one_liner: the skeptic-proof hook (under a dozen words) and the ~25-word one-liner.',
  thread: 'Fill ONLY thread: what lives in the always-on online Thread between gatherings.',
}

const TOOL_NAME = 'compose_circle_section'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return only the requested section of a Circle. Leave the other fields empty.',
  input_schema: {
    type: 'object',
    properties: {
      card: { type: 'string', description: 'The skeptic-proof hook, under a dozen words.' },
      one_liner: { type: 'string', description: 'About 25 words: who it is for and what they get.' },
      pillars_inside: {
        type: 'object',
        description: 'One concrete line each for how the Circle touches all four Pillars.',
        properties: {
          mind: { type: 'string' },
          body: { type: 'string' },
          spirit: { type: 'string' },
          expression: { type: 'string' },
        },
      },
      meetup: { type: 'string', description: 'The standing midweek Circle Meetup: what happens, roughly how long, in person or virtual.' },
      gathering: { type: 'string', description: 'The standing Weekend Gathering: the in-person activity.' },
      thread: { type: 'string', description: 'What lives in the always-on online Thread.' },
      agreements: { type: 'array', items: { type: 'string' }, description: 'Three or four plain norms.' },
      remix_options: { type: 'array', items: { type: 'string' }, description: 'A few variations a Host could run.' },
    },
  },
}

const SYSTEM = `You are Vera, Frequency's guide: warm, grounded, practical. A member is building a CIRCLE (an ongoing club of people into the same thing: real gatherings, an online Thread between them, a small group that knows you). They want help with ONE section.

The four Pillars (Mind, Body, Spirit, Expression) are not how Circles are sorted; each Circle leans one and carries the other three inside it. The rhythm is fixed: a midweek Circle Meetup, a Weekend Gathering, the Thread all week. In person is the default; always name a virtual path.

Draft ONLY the section asked for, grounded in what is already known about this Circle. Do not rewrite the other fields. Never invent a specific place, day, or fact you were not given. Plain language, short sentences, skeptic-proof, no jargon, no emoji, no em dashes. Always call the ${TOOL_NAME} tool.`

export async function composeCircleSection(input: {
  section: CircleComposeSection
  context: CircleComposeContext
  profileId?: string | null
}): Promise<CircleComposeResult | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(FEATURE)) return null

  const c = input.context
  const pillar = c.primaryPillar && (PILLARS as readonly string[]).includes(c.primaryPillar) ? c.primaryPillar : null
  const userText = [
    `The Circle so far:`,
    `Name: ${c.name.trim().slice(0, 120) || '(unnamed)'}`,
    pillar ? `Primary Pillar: ${pillar}` : '',
    c.topic ? `About: ${c.topic.trim().slice(0, 300)}` : '',
    c.audience ? `Who it is for: ${c.audience.trim().slice(0, 300)}` : '',
    c.identity ? `Identity: ${c.identity.trim().slice(0, 300)}` : '',
    '',
    SECTION_ASK[input.section],
    `Call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await completeRaw({
      tier: TIER,
      maxTokens: 500,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userText }],
    })
    void recordAiUsage({
      feature: FEATURE,
      model: MODELS[TIER],
      usage: res.usage,
      costUsd: estimateCostUsd(TIER, res.usage),
      profileId: input.profileId ?? null,
    })
    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    return block ? coerce(block.input, input.section) : null
  } catch {
    return null
  }
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function strArray(v: unknown, max: number, cap: number): string[] {
  return Array.isArray(v)
    ? v.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, max)).filter(Boolean).slice(0, cap)
    : []
}

function coerce(raw: unknown, section: CircleComposeSection): CircleComposeResult {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: CircleComposeResult = {}
  switch (section) {
    case 'card': {
      const card = str(r.card, 100)
      const oneLiner = str(r.one_liner, 280)
      if (card) out.card = card
      if (oneLiner) out.oneLiner = oneLiner
      break
    }
    case 'pillars': {
      const pi = r.pillars_inside && typeof r.pillars_inside === 'object' ? (r.pillars_inside as Record<string, unknown>) : {}
      const pillarsInside: Partial<Record<PillarSlug, string>> = {}
      for (const p of PILLARS) {
        const line = str(pi[p], 240)
        if (line) pillarsInside[p] = line
      }
      if (Object.keys(pillarsInside).length) out.pillarsInside = pillarsInside
      break
    }
    case 'rhythm': {
      const meetup = str(r.meetup, 600)
      const gathering = str(r.gathering, 600)
      if (meetup) out.meetup = meetup
      if (gathering) out.gathering = gathering
      break
    }
    case 'thread': {
      const thread = str(r.thread, 400)
      if (thread) out.thread = thread
      break
    }
    case 'agreements': {
      const agreements = strArray(r.agreements, 160, 5)
      if (agreements.length) out.agreements = agreements
      break
    }
    case 'remix': {
      const remixOptions = strArray(r.remix_options, 160, 8)
      if (remixOptions.length) out.remixOptions = remixOptions
      break
    }
  }
  return out
}
