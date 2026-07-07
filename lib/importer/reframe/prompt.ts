// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REFRAME prompt + tool schema (P2,
// docs/BUSINESS-IMPORTER.md §5 stage 5). PURE (no AI / IO): builds the system prompt, the
// forced structured-output tool, and the GROUNDING block from a VERIFIED draft, so the
// prompt construction is unit-testable and the trust boundary is inspectable.
//
// THE HARD RULE (docs §4.4): reframe consumes ONLY verified facts as grounding. The grounding
// block this module renders lists ONLY the fields the caller passes (the verifier's verified
// subset), never the raw harvest, never an unverified commercial claim. The model is told, in
// the strongest terms, that it may rephrase / position / compress what it is given but may NEVER
// invent a fact or restate a claim it was not handed. Everything it writes is prose the pipeline
// records as kind:'generated', so it stays subject to the prose gate (a commercial claim hiding
// in generated copy still cannot auto-publish).
//
// No em dashes in any of this file's strings (CONTENT-VOICE §10).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import type { BusinessProfile } from '../schema'

export const REFRAME_TOOL_NAME = 'save_reframed_copy'

/**
 * The forced structured-output tool: the voiced strings reframe returns. Each is OPTIONAL, so the
 * model returns only what the grounding supports (an empty grounding yields little or nothing, never
 * a fabricated story). Offering blurbs are keyed by index so they fold back onto the right offering.
 */
export const REFRAME_TOOL: Anthropic.Tool = {
  name: REFRAME_TOOL_NAME,
  description: 'Save the Frequency-voice copy rewritten from the verified business facts.',
  input_schema: {
    type: 'object',
    properties: {
      tagline: {
        type: 'string',
        description:
          'A short "say what you do" tagline, under 12 words. Plain, concrete, skeptic-proof. No hype, no claim you were not given.',
      },
      about: {
        type: 'string',
        description:
          'A 1 to 2 sentence about line: who they are and what to expect, in plain Frequency voice. Grounded only in the verified facts.',
      },
      story: {
        type: 'string',
        description:
          'A short narrative (2 to 4 short sentences) of the transformation this business offers. Concrete, honest, never inflated. Only what the facts support.',
      },
      offeringBlurbs: {
        type: 'array',
        description: 'One rewritten blurb per offering you were given, in the SAME order. Omit an entry to leave an offering blurb unchanged.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number', description: 'The 0-based index of the offering in the OFFERINGS list you were given.' },
            blurb: { type: 'string', description: 'A one-line, plain, honest blurb for that offering. No price claim unless it was in the facts.' },
          },
          required: ['index', 'blurb'],
        },
      },
    },
    required: [],
  },
}

export const REFRAME_SYSTEM = `You rewrite a verified business into the Frequency voice for the business importer.

You are given a VERIFIED FACTS block: the facts about this business that have already been checked against a source. This is the ONLY thing you may draw on.

The hard rules (these override everything else):
- Use ONLY the verified facts you are given. Never invent a fact, a history, an award, a testimonial, a price, or a claim. If a fact is not in the block, it does not exist for you.
- You may rephrase, position, compress, and reorder what you are given. You may NOT add anything new.
- Do not restate a specific commercial claim (a price, a phone number, an address, opening hours, a rating) inside the story, about, or tagline. Those live in their own fields on the page. Your prose describes what the business is and what it is like to work with, not its price list.
- Write the transformation plainly: what changes for the person who uses this business. Concrete and honest, never a promise of transformation, never a health claim.
- If the verified facts are thin, write LESS. A short honest line beats a padded one. It is fine to leave a field empty.

Call ${REFRAME_TOOL_NAME} once with the copy you can honestly write from these facts.`

/**
 * Render the VERIFIED draft into the grounding block. ONLY safe, verified fields are listed: the
 * name / brand / type / category, the (already verified) about + story as raw material, offering
 * titles + any verified blurbs, and a plain note of WHICH commercial facts exist (by label only, so
 * the model knows the business has hours / a price without being able to quote a specific figure it
 * might launder into prose). It NEVER prints the raw harvest or an unverified value. PURE.
 */
export function buildGroundingBlock(verified: BusinessProfile): string {
  const parts: string[] = ['VERIFIED FACTS:']
  parts.push(`name: ${verified.name}`)
  if (verified.brandName?.trim()) parts.push(`brand name: ${verified.brandName.trim()}`)
  parts.push(`type: ${verified.type}`)
  if (verified.category?.trim()) parts.push(`category: ${verified.category.trim()}`)
  if (verified.about?.trim()) parts.push(`current about copy (raw material to rewrite): ${verified.about.trim()}`)
  if (verified.story?.trim()) parts.push(`current story copy (raw material to rewrite): ${verified.story.trim()}`)

  const offerings = (verified.offerings ?? []).filter((o) => o.title?.trim())
  if (offerings.length) {
    parts.push('OFFERINGS (title, then any existing blurb; index is 0-based):')
    offerings.forEach((o, i) => {
      const blurb = o.blurb?.trim()
      parts.push(`  [${i}] ${o.title.trim()}${blurb ? `: ${blurb}` : ''}`)
    })
  }

  // Non-quoting presence flags: the model may know a fact EXISTS (so it does not claim the opposite)
  // without being handed the value to restate. These are labels, never the underlying figures.
  const present: string[] = []
  if (verified.contact?.address?.trim()) present.push('a physical location')
  if (verified.contact?.hours?.trim()) present.push('published hours')
  if (verified.contact?.phone?.trim() || verified.contact?.email?.trim()) present.push('a way to get in touch')
  if (verified.rating?.value?.trim()) present.push('a public rating')
  if ((verified.offerings ?? []).some((o) => typeof o.price === 'number')) present.push('published prices')
  if (present.length) {
    parts.push(
      `This business also has: ${present.join(', ')}. Those show in their own fields on the page. Do NOT restate the specific figures in your prose.`,
    )
  }

  parts.push('', `Rewrite this in the Frequency voice and call ${REFRAME_TOOL_NAME}.`)
  return parts.join('\n')
}
