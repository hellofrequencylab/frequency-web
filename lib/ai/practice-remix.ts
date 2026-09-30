// Vera's "Remix it" directions for a library Practice (LIVE-645, ADR-1608). The practice twin of a
// Starter Circle's `remixOptions` (lib/circles/templates.ts; docs/NAMING.md, Starter Circles): a
// member opening the Remix dialog on a practice they don't own sees three short ways to take it
// ("Two minutes, for mornings", "Gentler", "With a friend") beside a plain "Just copy it".
//
// Generated on dialog open and never stored, so there is no column and no migration. Picking one
// forks through the unchanged fork path (lineage intact) and then applies the direction to the COPY
// through the existing practice-edit path (lib/ai/practice-edit.ts, `remixRequest` below frames
// it), so no second editor exists.
//
// One declared spark over the shared runner (lib/ai/spark.ts): the kill switch, the 'practice-remix'
// daily cap (lib/ai/budget.ts), the per-member window, the forced tool, the voice primer and the
// degrade-to-null all live there. Haiku: three short lines, one call per dialog open. AI off or over
// budget returns null and the dialog is exactly what it was before this module existed.

import type Anthropic from '@anthropic-ai/sdk'
import { defineSpark, runSpark, sparkStrArray } from './spark'
import { withPracticeShape } from './practice-shape'
import { voiceLine } from './voice'

const FEATURE = 'practice-remix'

/** How many directions the dialog offers. Three is enough to choose from on a phone. */
export const REMIX_DIRECTION_COUNT = 3
/** One direction is a chip label, not a paragraph. */
export const REMIX_DIRECTION_MAX = 60

/** The practice as Vera sees it when proposing directions. Only what a member can already read. */
export interface PracticeForRemix {
  title: string
  summary: string | null
  cadence: string | null
  durationMin: number | null
  body: string | null
}

const TOOL_NAME = 'suggest_remix_directions'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Return three short directions a member could take this practice in when they remix it.',
  input_schema: {
    type: 'object',
    properties: {
      directions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Exactly three directions, each 2 to 6 words, sentence case, no final period. Each one changes a different thing (time or length, intensity, setting, who you do it with).',
      },
    },
    required: ['directions'],
  },
}

const SYSTEM = `You are Vera, Frequency's warm, plain-spoken guide. A member is about to Remix a Practice someone else made: they get their own copy to change. Offer three short directions they could take it in, so their copy is a practice only they would make.

Rules:
- Exactly three directions. Each is 2 to 6 words, sentence case, no final period. Examples of the shape: "Two minutes, for mornings", "Gentler", "With a friend", "On a walk", "Before bed".
- Each direction changes a different thing: how long, how hard, where or when, or who you do it with. Never three versions of the same change.
- Keep the act the same practice. A direction reshapes it; it never swaps it for a different practice.
- Fit this practice. A direction that is already true of it (a two-minute practice made "shorter") is not a direction.
- Plain and concrete. No hype, no emoji, no em dashes, never narrate feelings, never the word "Mission".
- Always call the ${TOOL_NAME} tool.`

/** Re-coerce the model's list: trimmed, the voice's mechanical rules applied (no dashes), clamped,
 *  a trailing period dropped, case-insensitive duplicates removed, at most three. Fewer than two
 *  is not a choice, so it is null and the dialog stays as it was. */
export function coerceRemixDirections(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'object') return null
  const list = sparkStrArray((raw as Record<string, unknown>).directions, 200, 8)
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const line = voiceLine(item).replace(/[.\s]+$/, '').trim()
    if (!line || line.length > REMIX_DIRECTION_MAX) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line.charAt(0).toUpperCase() + line.slice(1))
    if (out.length === REMIX_DIRECTION_COUNT) break
  }
  return out.length >= 2 ? out : null
}

/** The declared remix spark. Its own budget key ('practice-remix') and Haiku. */
export const PRACTICE_REMIX = defineSpark<string[]>({
  entity: 'practice',
  feature: FEATURE,
  tier: 'haiku',
  maxTokens: 300,
  tool: TOOL,
  system: withPracticeShape(SYSTEM),
  coerce: coerceRemixDirections,
})

/** Three directions for one practice, or null (AI off, over budget, throttled, or unusable). */
export async function suggestRemixDirections(input: {
  practice: PracticeForRemix
  profileId?: string | null
}): Promise<string[] | null> {
  const p = input.practice
  if (!p.title.trim()) return null
  const facts = [
    'THE PRACTICE',
    `Name: ${p.title.trim().slice(0, 120)}`,
    p.summary ? `Hook: ${p.summary.slice(0, 200)}` : '',
    p.cadence ? `Cadence: ${p.cadence.slice(0, 40)}` : '',
    p.durationMin ? `Length: about ${p.durationMin} minutes` : '',
    p.body ? `Guide:\n${p.body.slice(0, 1500)}` : '',
  ].filter(Boolean)
  const content = `${facts.join('\n')}\n\nOffer three directions and call ${TOOL_NAME}.`
  return runSpark(PRACTICE_REMIX, { content, profileId: input.profileId })
}

/** Bound what the fork action accepts as a direction: a chip label, trimmed, or null. The action
 *  takes any short line (the member owns the copy, the same as typing a change in the editor), so
 *  this bounds its size, not its content. */
export function normalizeRemixDirection(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const line = v.trim().slice(0, REMIX_DIRECTION_MAX)
  return line || null
}

/** The plain-language change handed to the practice-edit path for the member's copy. */
export function remixRequest(direction: string): string {
  return `Remix this practice in one direction: ${direction}. Change what that direction asks for (length, intensity, setting, or who it is done with) across the name, hook, description, guide and cadence as needed. Keep the same core act and everything the direction does not touch.`
}
