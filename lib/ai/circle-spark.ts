// Vera's "Spark" for the Circle builder. From a few light answers (what the club
// is, who it is for, the primary Pillar, optional cadence) OR a pasted outline,
// Vera drafts the whole Circle frame: name, Card, one-liner, identity, the four
// Pillars inside it, the standing rhythm (Meetup + Gathering + Thread), format,
// size, agreements, and remix ideas. A starting point the Host edits, never a
// commit. Mirrors lib/ai/journey-spark.ts: forced-tool structured output + the
// voice primer + the usage ledger, never trusting the raw shape. Degrades to null
// when AI is off (the wizard then lets the Host type it by hand).

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import type { PillarSlug } from '@/lib/pillars'

const FEATURE = 'circle-spark'
// Drafting plain copy across a fixed set of fields is structured but not deep
// reasoning, so Sonnet clears the bar at a fraction of Opus (lib/ai/models.ts).
const TIER = 'sonnet' as const

const PILLARS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

export interface CircleSparkAnswers {
  /** What the club is about (a topic, an activity). */
  topic: string
  /** Who it is for. */
  who: string
  /** The lean — one Pillar; the other three live inside it. Optional. */
  primaryPillar: PillarSlug | null
  /** Optional free text on when/how it meets ("Wednesdays, coffee after"). */
  cadence?: string
}

export interface CircleSparkDraft {
  name: string
  primaryPillar: PillarSlug | null
  card: string
  oneLiner: string
  identity: string
  audience: string
  pillarsInside: Partial<Record<PillarSlug, string>>
  meetup: string
  gathering: string
  thread: string
  format: string
  sizeLabel: string
  agreements: string[]
  remixOptions: string[]
}

const TOOL_NAME = 'draft_circle'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Return a complete first draft of a Circle's frame.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short, plain, concrete name a stranger would repeat. Name it for the people, not the topic. No surrounding quotes. (<= 50 chars)' },
      card: { type: 'string', description: 'The skeptic-proof hook: name the ache and the fix in under a dozen words. (<= 80 chars)' },
      one_liner: { type: 'string', description: 'About 25 words: who it is for and what they get. Plain, no hype. (<= 220 chars)' },
      identity: { type: 'string', description: 'One line on what it is and who it is for.' },
      audience: { type: 'string', description: 'The person who would join, in a phrase.' },
      pillars_inside: {
        type: 'object',
        description: 'One concrete line each for how this Circle touches all four Pillars. Every Circle works the whole person; the primary Pillar is just the lean.',
        properties: {
          mind: { type: 'string', description: 'One concrete line for Mind.' },
          body: { type: 'string', description: 'One concrete line for Body.' },
          spirit: { type: 'string', description: 'One concrete line for Spirit.' },
          expression: { type: 'string', description: 'One concrete line for Expression.' },
        },
      },
      meetup: { type: 'string', description: 'The standing midweek Circle Meetup: what happens, roughly how long, in person or virtual.' },
      gathering: { type: 'string', description: 'The standing Weekend Gathering: the in-person activity, the main event.' },
      thread: { type: 'string', description: 'What lives in the always-on online Thread between gatherings.' },
      format: { type: 'string', description: 'How it runs in person, virtual, and hybrid. In person is the default; always name a virtual path.' },
      size_label: { type: 'string', description: 'The headcount that makes it work, e.g. "5 to 10".' },
      agreements: { type: 'array', items: { type: 'string' }, description: 'Three or four plain norms, stated once.' },
      remix_options: { type: 'array', items: { type: 'string' }, description: 'A few variations a Host could run instead, to make it theirs.' },
    },
    required: ['name', 'card', 'one_liner', 'identity'],
  },
}

const SYSTEM = `You are Vera, Frequency's guide: warm, grounded, practical, a camp counselor you actually respect, not a guru and not a hype machine. A member is starting a CIRCLE: an ongoing club of people into the same thing. It is a cross between a Meetup, a group chat, and a home church: real gatherings you show up to, an online Thread you live in between them, and a small consistent group that actually knows you.

Draft the whole frame from what they tell you: a name, the Card, a one-liner, the identity, the four Pillars inside it, the standing rhythm, the format, the size, the agreements, and a few remix ideas.

Hold these truths:
- The four Pillars (Mind, Body, Spirit, Expression) are NOT how Circles are sorted. Each Circle leans ONE primary Pillar and carries the other three inside it. Write one honest, concrete line for each Pillar. The interest is the reason to show up; the small consistent group is what makes people stay.
- The rhythm is fixed: a midweek Circle Meetup to get known, a Weekend Gathering to do the thing, the Thread running all week. In person is the default; always name a virtual path so busy weeks and distance do not kill it.
- The Card must pass the skeptic test: it has to still sound like it could be for someone who would say "that is not really my thing."

PRECEDENCE: if the member pasted their own outline, follow THEM. Draft from it, faithful to their intent and wording where it helps. Never invent a specific place, day, or fact you were not given.

How to write: plain language, short sentences, lead with the problem or the feeling. Specific and honest, never promise transformation. No jargon, no mysticism, no emoji, no em dashes. Always call the ${TOOL_NAME} tool.`

export async function draftCircleSpark(
  input: CircleSparkAnswers & { profileId?: string | null; sourceText?: string },
): Promise<CircleSparkDraft | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(FEATURE)) return null

  const src = input.sourceText?.trim().slice(0, 8000)
  const pillar = input.primaryPillar && (PILLARS as readonly string[]).includes(input.primaryPillar) ? input.primaryPillar : null
  const userText = [
    src
      ? `The member pasted their own write-up. Read it closely and draft the Circle FROM it, staying faithful to their intent:\n"""\n${src}\n"""\n`
      : '',
    `What it is about: ${input.topic.trim().slice(0, 400) || 'an interest people share'}`,
    `Who it is for: ${input.who.trim().slice(0, 400) || 'busy adults who want real friends'}`,
    pillar ? `Primary Pillar (the lean): ${pillar}` : 'Primary Pillar: pick the most honest lean yourself.',
    input.cadence?.trim() ? `How it meets: ${input.cadence.trim().slice(0, 300)}` : '',
    '',
    `Draft the Circle and call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res = await completeRaw({
      tier: TIER,
      maxTokens: 900,
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
    return block ? coerce(block.input, pillar) : null
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

function coerce(raw: unknown, primaryPillar: PillarSlug | null): CircleSparkDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name, 60).replace(/^["']+|["']+$/g, '')
  if (!name) return null

  const pi = r.pillars_inside && typeof r.pillars_inside === 'object' ? (r.pillars_inside as Record<string, unknown>) : {}
  const pillarsInside: Partial<Record<PillarSlug, string>> = {}
  for (const p of PILLARS) {
    const line = str(pi[p], 240)
    if (line) pillarsInside[p] = line
  }

  return {
    name,
    primaryPillar,
    card: str(r.card, 100),
    oneLiner: str(r.one_liner, 280),
    identity: str(r.identity, 280),
    audience: str(r.audience, 280),
    pillarsInside,
    meetup: str(r.meetup, 600),
    gathering: str(r.gathering, 600),
    thread: str(r.thread, 400),
    format: str(r.format, 400),
    sizeLabel: str(r.size_label, 60),
    agreements: strArray(r.agreements, 160, 5),
    remixOptions: strArray(r.remix_options, 160, 8),
  }
}
