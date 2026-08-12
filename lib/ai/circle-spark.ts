// Vera's Circle drafting, two declared sparks (ADR-990) over one shared runner.
//
//   • CIRCLE_SPARK ('circle-spark', Sonnet) — the Circle builder's opening step. From a few
//     light answers (what the club is, who it is for, the primary Pillar, optional cadence) OR
//     a pasted outline, Vera drafts the whole frame: name, Card, one-liner, identity, the four
//     Pillars inside it, the standing rhythm (Meetup + Gathering + Thread), format, size,
//     agreements, and remix ideas. A starting point the Host edits, never a commit.
//   • CIRCLE_SUGGEST ('circle-create', Haiku) — the small start-a-circle assist on the modal:
//     an Interest goes in, a name and a short about blurb come back. This was
//     lib/ai/circle-wizard.ts, which predated the sparks and hand-rolled the same preamble;
//     retired into this declaration, with its deterministic fallback beside it.
//
// The kill switch, the per-feature budget cap, the forced-tool call, the voice + mood primers,
// the usage ledger, and the degrade-to-null all live in runSpark (lib/ai/spark.ts). Both paths
// return null when AI is off, so the builder falls back to hand entry and the modal falls back
// to fallbackCircleSuggestion.

import type Anthropic from '@anthropic-ai/sdk'
import type { SeedMood } from '@/lib/studio/kernel/moods'
import type { PillarSlug } from '@/lib/pillars'
import { defineSpark, runSpark, sparkStr, sparkStrArray } from './spark'

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
  /** The MOOD dial (ADR-986): steers TONE only. It never changes what is true, just how it reads. */
  mood?: SeedMood
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

/** The declared Circle spark. The primary Pillar rides along as the coercer's context: the Host
 *  picked it, so it is carried through rather than read back off the model. */
export const CIRCLE_SPARK = defineSpark<CircleSparkDraft, PillarSlug | null>({
  entity: 'circle',
  feature: FEATURE,
  tier: TIER,
  maxTokens: 900,
  tool: TOOL,
  system: SYSTEM,
  coerce,
})

export async function draftCircleSpark(
  input: CircleSparkAnswers & { profileId?: string | null; sourceText?: string },
): Promise<CircleSparkDraft | null> {
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

  return runSpark(CIRCLE_SPARK, {
    content: userText,
    context: pillar,
    mood: input.mood,
    profileId: input.profileId,
  })
}

/** Re-coerce every field. Never trust the raw model shape. */
export function coerce(raw: unknown, primaryPillar: PillarSlug | null): CircleSparkDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = sparkStr(r.name, 60).replace(/^["']+|["']+$/g, '')
  if (!name) return null

  const pi = r.pillars_inside && typeof r.pillars_inside === 'object' ? (r.pillars_inside as Record<string, unknown>) : {}
  const pillarsInside: Partial<Record<PillarSlug, string>> = {}
  for (const p of PILLARS) {
    const line = sparkStr(pi[p], 240)
    if (line) pillarsInside[p] = line
  }

  return {
    name,
    primaryPillar,
    card: sparkStr(r.card, 100),
    oneLiner: sparkStr(r.one_liner, 280),
    identity: sparkStr(r.identity, 280),
    audience: sparkStr(r.audience, 280),
    pillarsInside,
    meetup: sparkStr(r.meetup, 600),
    gathering: sparkStr(r.gathering, 600),
    thread: sparkStr(r.thread, 400),
    format: sparkStr(r.format, 400),
    sizeLabel: sparkStr(r.size_label, 60),
    agreements: sparkStrArray(r.agreements, 160, 5),
    remixOptions: sparkStrArray(r.remix_options, 160, 8),
  }
}

// ── The start-a-circle assist, retired from lib/ai/circle-wizard.ts ───────────────────────────

export interface CircleSuggestion {
  name: string
  about: string
}

const SUGGEST_TOOL_NAME = 'suggest_circle'

const SUGGEST_TOOL: Anthropic.Tool = {
  name: SUGGEST_TOOL_NAME,
  description: 'Return a suggested name and about blurb for a new local circle.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A short, inviting circle name (≤ 50 chars). Evokes the practice + gathering regularly. No surrounding quotes.',
      },
      about: {
        type: 'string',
        description: 'One or two warm, plain sentences (≤ 240 chars), second person: what they do together and that newcomers are welcome.',
      },
    },
    required: ['name', 'about'],
  },
}

const SUGGEST_SYSTEM = `You are Vera, Frequency's warm, encouraging guide. A member is starting a CIRCLE, a small local crew (up to ~50 people) who meet regularly around one shared practice. Suggest a name and a short "about" for their circle.

Rules:
- name: short and inviting, evocative of the practice and of gathering regularly. Avoid a generic "X Group"; prefer something a person would want to join. No surrounding quotes.
- about: one or two warm, plain sentences on what they do together and that all levels / newcomers are welcome. Second person, no hype, no emoji.
- Never invent a specific place, day, or any fact you weren't given.
- Always call the suggest_circle tool.`

/** The declared suggest spark. Its own budget key ('circle-create', $1) and its own tier (Haiku:
 *  one short draft per start). Both unchanged from lib/ai/circle-wizard.ts. */
export const CIRCLE_SUGGEST = defineSpark<CircleSuggestion>({
  entity: 'circle',
  feature: 'circle-create',
  tier: 'haiku',
  maxTokens: 300,
  tool: SUGGEST_TOOL,
  system: SUGGEST_SYSTEM,
  coerce: coerceSuggestion,
})

export async function suggestCircleDraft(input: {
  interest: string
  type: 'in-person' | 'online'
  profileId?: string | null
}): Promise<CircleSuggestion | null> {
  const interest = input.interest.trim().slice(0, 120)
  if (!interest) return null

  const userText = [
    `Interest / practice: ${interest}`,
    `Format: ${input.type === 'online' ? 'Online (meets virtually)' : 'In-person (meets locally)'}`,
    '',
    `Suggest a name and about for this circle and call ${SUGGEST_TOOL_NAME}.`,
  ].join('\n')

  return runSpark(CIRCLE_SUGGEST, { content: userText, profileId: input.profileId })
}

/** Re-coerce every field. Never trust the raw model shape. */
export function coerceSuggestion(raw: unknown): CircleSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = sparkStr(r.name, 60).replace(/^["']+|["']+$/g, '')
  const about = sparkStr(r.about, 280)
  if (!name) return null
  return { name, about }
}

/** Deterministic, still-useful suggestion for when Vera (AI) is off or over budget,
 *  so the "Suggest" affordance always returns something the host can edit. */
export function fallbackCircleSuggestion(interest: string, type: 'in-person' | 'online'): CircleSuggestion {
  const i = interest.trim() || 'this practice'
  const name = `${type === 'online' ? 'Online ' : ''}${i} Circle`
  const about =
    type === 'online'
      ? `A crew who gather online to practice ${i.toLowerCase()} together, regularly. Newcomers welcome. You just have to show up.`
      : `A local crew who meet regularly to practice ${i.toLowerCase()} together. Newcomers welcome. You just have to show up.`
  return { name, about }
}
