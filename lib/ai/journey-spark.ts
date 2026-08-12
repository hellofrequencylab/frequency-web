// Vera's "Spark" for the guided Journey builder (ADR-302). From a few light onboarding answers
// (who it's for, what it's about, the outcome, how many weeks, the daily pace), Vera drafts the
// Journey's identity plus the weekly arc. The four-Pillar practices are drafted in later steps.
//
// This file is now a DECLARATION (ADR-990): the tool schema, the tier, the system prompt, the
// budget key, and the coercer. The kill switch, the budget gate, the forced-tool call, the voice
// primer, the mood dial, the usage ledger, and the degrade-to-null are all runSpark's job
// (lib/ai/spark.ts), shared with every other entity. Degrades to null when AI is off, so the
// wizard lets the author type the identity by hand.

import type Anthropic from '@anthropic-ai/sdk'
import type { SeedMood } from '@/lib/studio/kernel/moods'
import { defineSpark, runSpark, sparkStr, sparkStrArray, sparkStrOrNull, sparkInt, sparkEnum } from './spark'
import { withJourneyShape } from './journey-shape'

const FEATURE = 'journey-spark'
// Drafting a title, a one-line promise, a short overview and a weekly arc is structured but not
// deep reasoning, so Sonnet clears the quality bar at a fraction of Opus's cost (lib/ai/models.ts:
// "escalate to Opus only deliberately"). The composition + edit paths stay on Opus.
const SPARK_TIER = 'sonnet' as const

export type JourneyPace = 'light' | 'medium'

export interface SparkAnswers {
  /** Who the Journey is for. */
  who: string
  /** What it's about — a topic, or general wellbeing. */
  topic: string
  /** What people should walk away with. */
  outcome: string
  /** How many weeks (one weekly Phase each). */
  weeks: number
  /** Roughly how much time a day. */
  pace: JourneyPace
  /** The MOOD dial (ADR-986): steers TONE only. It never changes what is true, just how it reads. */
  mood?: SeedMood
}

/** One week of the arc: a short focus title + a one-line description. */
export interface ArcWeek {
  title: string
  focus: string
}

/** Journey settings Vera can lift from an uploaded outline (ADR-302). All optional — only filled
 *  when the source states them, so nothing is invented on the questions path. */
export interface SparkSettings {
  difficulty: 'gentle' | 'standard' | 'deep' | null
  category: string | null
  tags: string[]
  dailyMinutes: number | null
}

/** How a Circle meets around the Journey, lifted from an uploaded outline (ADR-302). A subset of
 *  JourneyMeeting — only the fields an outline tends to state. All optional; nothing is invented. */
export interface SparkMeeting {
  format: 'virtual' | 'in_person' | 'hybrid' | null
  /** When it meets, free text (e.g. "Sundays 7pm"). */
  schedule: string | null
  /** Timezone label for the schedule (e.g. "ET"). */
  timezone: string | null
  /** Where it meets (a place, for in-person/hybrid). */
  location: string | null
  /** A join link (for virtual/hybrid). */
  link: string | null
}

export interface JourneySpark {
  title: string
  /** One line, leading with the outcome. */
  promise: string
  /** A short, warm paragraph. */
  overview: string
  /** The weekly arc — one focus per week, building across the Journey (last week a gentle
   *  reflection). Length matches the requested weeks; empty when Vera couldn't draft it. */
  arc: ArcWeek[]
  /** Settings lifted from an uploaded outline (difficulty, category, tags, daily minutes). */
  settings: SparkSettings
  /** How the group meets, lifted from an uploaded outline (format, schedule, link…). All-null when
   *  the outline says nothing about it. */
  meeting: SparkMeeting
}

const TOOL_NAME = 'draft_journey_spark'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Return the Journey's identity: a title, a one-line promise, and a short overview.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short, plain, evocative name (<= 60 chars). Title case.' },
      promise: { type: 'string', description: 'One line that leads with the outcome, plain, no hype (<= 140 chars).' },
      overview: { type: 'string', description: 'Two to four short sentences on what this is and who it is for. Lead with the problem or feeling.' },
      arc: {
        type: 'array',
        description: 'The weekly arc: EXACTLY one entry per week, in order, each building on the last; the final week is a gentle reflection.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: "The week's focus as a short title (<= 40 chars), e.g. 'Wind down the evening'." },
            focus: { type: 'string', description: "One plain sentence on what this week is about and why it comes here." },
          },
          required: ['title', 'focus'],
        },
      },
      settings: {
        type: 'object',
        description: 'Settings to pre-fill, ONLY when the author\'s uploaded outline clearly states them. Omit any you are not sure about. Never invent these from the short answers.',
        properties: {
          difficulty: { type: 'string', enum: ['gentle', 'standard', 'deep'], description: 'How demanding the Journey is, if the outline says.' },
          category: { type: 'string', description: 'A short theme/category if the outline names one (e.g. "Rest and recovery").' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Up to 6 short topic tags if the outline lists or implies them (e.g. sleep, calm, screens).' },
          daily_minutes: { type: 'integer', description: 'Roughly how many minutes a day the outline asks for, if stated.' },
        },
      },
      meeting: {
        type: 'object',
        description: 'How the group MEETS, ONLY when the outline states it. Omit any field you are unsure about. Never invent these from the short answers; an outline that says nothing about meeting should leave this empty.',
        properties: {
          format: { type: 'string', enum: ['virtual', 'in_person', 'hybrid'], description: 'Whether the group meets online, in person, or both, if the outline says.' },
          schedule: { type: 'string', description: 'When it meets, in the outline\'s own words (e.g. "Sundays 7pm").' },
          timezone: { type: 'string', description: 'A short timezone label for the schedule if stated (e.g. "ET", "PST").' },
          location: { type: 'string', description: 'Where it meets, for in-person or hybrid groups, if the outline names a place.' },
          link: { type: 'string', description: 'A join link for a virtual or hybrid group, if the outline gives one.' },
        },
      },
    },
    required: ['title', 'promise', 'overview', 'arc'],
  },
}

const SYSTEM = `You are Vera, Frequency's guide: warm, grounded, and practical, a camp counselor you actually respect, not a guru and not a hype machine. An author answered a few questions about a Journey they want to build. A Journey is a themed path of small daily practices a Circle travels together, balanced underneath across four Pillars (Mind, Body, Spirit, Expression).

Draft the Journey's frame: a title, a one-line promise that leads with the outcome, a short overview, and the WEEKLY ARC.

The arc is one focus per week, in order, that builds across the Journey like a good course: each week leans on the last, the early weeks are gentle, and the FINAL week is a calm reflection that ties it together. Give EXACTLY one entry per week for the length requested. The four Pillars (Mind, Body, Spirit, Expression) are the modules underneath; the weekly focus is the lens, not a new set of tasks. Work backward: outcome first, then the evidence it landed, then the weekly focuses that get there.

Default shape when the author has not specified one: a four-week arc, with a gentle onboarding before week 1 and a tangible close at the end. Honor the length the author actually asked for; only lean on four weeks when they leave it open.

PRECEDENCE: if the author pasted their own course outline or clearly asked for a different length or shape, follow THEM. That instruction outranks the default template below. From the outline, also fill SETTINGS (difficulty, category, tags, daily minutes) and MEETING (format, schedule, timezone, location, join link) from what the outline actually states. Only include a field when the outline makes it clear; never invent these from the short answers alone, and omit anything you are unsure about. An outline that says nothing about how the group gathers should leave MEETING empty.

How to write:
- Plain language, short sentences. Lead with the problem or the feeling.
- Specific and honest. Never promise transformation.
- No jargon, no mysticism, no emoji, no em dashes.
- Always call the ${TOOL_NAME} tool.`

/** The declared Journey spark. `weeks` rides along as the coercer's context so the arc is
 *  clamped to the length the AUTHOR asked for, never the length the model felt like returning. */
export const JOURNEY_SPARK = defineSpark<JourneySpark, number>({
  entity: 'journey',
  feature: FEATURE,
  tier: SPARK_TIER,
  maxTokens: 600,
  tool: TOOL,
  system: withJourneyShape(SYSTEM),
  coerce,
})

export async function draftJourneySpark(
  input: SparkAnswers & { profileId?: string | null; sourceText?: string },
): Promise<JourneySpark | null> {
  const src = input.sourceText?.trim().slice(0, 8000)
  const userText = [
    src
      ? `The author pasted their own course write-up. Read it closely and draft the Journey (title, promise, overview, weekly arc) FROM it, staying faithful to their intent and wording where it helps:\n"""\n${src}\n"""\n`
      : '',
    `Who it is for: ${input.who.trim().slice(0, 400) || 'anyone'}`,
    `What it is about: ${input.topic.trim().slice(0, 400) || 'general wellbeing'}`,
    `What they walk away with: ${input.outcome.trim().slice(0, 400) || 'a steadier week'}`,
    `Length: ${input.weeks} ${input.weeks === 1 ? 'week' : 'weeks'}`,
    `Time a day: ${input.pace}`,
    '',
    `Draft the identity and call ${TOOL_NAME}.`,
  ]
    .filter(Boolean)
    .join('\n')

  return runSpark(JOURNEY_SPARK, {
    content: userText,
    context: input.weeks,
    mood: input.mood,
    profileId: input.profileId,
  })
}

/** Re-coerce every field. Never trust the raw model shape. */
export function coerce(raw: unknown, weeks: number): JourneySpark | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = sparkStr(r.title, 80)
  const promise = sparkStr(r.promise, 200)
  const overview = sparkStr(r.overview, 1200)
  if (!title) return null

  // The weekly arc — one entry per week, clamped to the requested length.
  const want = Math.min(12, Math.max(1, Math.floor(weeks) || 4))
  const arc: ArcWeek[] = []
  if (Array.isArray(r.arc)) {
    for (const w of r.arc) {
      if (arc.length >= want) break
      if (!w || typeof w !== 'object') continue
      const ww = w as Record<string, unknown>
      const wt = sparkStr(ww.title, 80)
      const wf = sparkStr(ww.focus, 300)
      if (wt) arc.push({ title: wt, focus: wf })
    }
  }

  // Settings: only what Vera lifted from the outline. Everything else stays null/empty.
  const s = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>
  const settings: SparkSettings = {
    difficulty: sparkEnum(s.difficulty, ['gentle', 'standard', 'deep'] as const),
    category: sparkStrOrNull(s.category, 60),
    tags: sparkStrArray(s.tags, 40, 6),
    dailyMinutes: sparkInt(s.daily_minutes, 1, 600),
  }

  // Meeting / format: only what Vera lifted from the outline, everything else stays null. Bounds
  // mirror normalizeJourneyMeeting (lib/journey-plans.ts) so what we collect survives that re-normalize.
  const m = (r.meeting && typeof r.meeting === 'object' ? r.meeting : {}) as Record<string, unknown>
  const meeting: SparkMeeting = {
    format: sparkEnum(m.format, ['virtual', 'in_person', 'hybrid'] as const),
    schedule: sparkStrOrNull(m.schedule, 120),
    timezone: sparkStrOrNull(m.timezone, 40),
    location: sparkStrOrNull(m.location, 200),
    link: sparkStrOrNull(m.link, 500),
  }

  return { title, promise, overview, arc, settings, meeting }
}
