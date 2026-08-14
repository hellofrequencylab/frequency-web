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

export const REFRAME_SYSTEM = `You write a business's own copy into the Frequency voice for the business importer.

You are given a VERIFIED FACTS block: the facts about this business that have already been checked against a source. You may also be given a SOURCE MATERIAL block: the business's own words, lifted verbatim from their website and from what the operator pasted.

How to use the two blocks:
- SOURCE MATERIAL is how this business actually talks. Prefer THEIR sentences over yours. Lift the good ones close to verbatim, trim them to fit, and cut hype, filler, and em dashes. Write your own sentences only for the connective tissue and for what their words do not cover.
- VERIFIED FACTS is the fact authority. Where the two disagree about a fact, the verified block wins.

The hard rules (these override everything else):
- Never invent a fact, a history, an award, a testimonial, a price, or a claim. If it is in neither block, it does not exist for you.
- You may rephrase, position, compress, reorder, and lift. You may NOT add anything new.
- Do not restate a specific commercial claim (a price, a phone number, an address, opening hours, a rating) inside the story, about, or tagline. Those live in their own fields on the page. Your prose describes what the business is and what it is like to work with, not its price list.
- Write the transformation plainly: what changes for the person who uses this business. Concrete and honest, never a promise of transformation, never a health claim.
- If the verified facts are thin, write LESS. A short honest line beats a padded one. It is fine to leave a field empty.
- If an audience and positioning steer is given, aim the copy at that reader and match that positioning. It is a private brief, not a fact: never quote it back or name the audience on the page.

Call ${REFRAME_TOOL_NAME} once with the copy you can honestly write from these facts.`

/** How much of the verbatim source excerpt reframe is handed. Reframe writes four short strings, so
 *  it needs a taste of the voice, not the whole site (the page COMPOSER gets the full excerpt). */
const REFRAME_EXCERPT_CHARS = 6_000

/**
 * Render the VERIFIED draft into the grounding block, optionally followed by the business's own
 * words (`sourceExcerpt`, built by lib/importer/excerpt.ts) as SOURCE MATERIAL to lift from.
 *
 * The verified block lists ONLY safe, verified fields: the name / brand / type / category, the
 * already-verified about + story as raw material, offering titles + any verified blurbs, and a plain
 * note of WHICH commercial facts exist (by label only, so the model knows the business has hours or a
 * price without being handed a figure to quote).
 *
 * THE TRUST POSTURE (ADR, docs §4.4): the source excerpt is the business's own unverified copy, so
 * handing it over trades "grounding starvation" for an explicit downstream check. The prompt forbids
 * restating any specific figure, and everything reframe writes is tagged kind:'generated' and then run
 * through the PROSE SAFETY SCAN (lib/importer/prose-scan.ts): prose carrying a price, phone, address,
 * hours, rating, health, or superlative claim stays gated exactly as it was before. So a commercial
 * claim still cannot ride into a live surface inside a sentence. PURE.
 */
export function buildGroundingBlock(verified: BusinessProfile, sourceExcerpt?: string): string {
  const parts: string[] = ['VERIFIED FACTS:']
  parts.push(`name: ${verified.name}`)
  if (verified.brandName?.trim()) parts.push(`brand name: ${verified.brandName.trim()}`)
  parts.push(`type: ${verified.type}`)
  if (verified.category?.trim()) parts.push(`category: ${verified.category.trim()}`)
  if (verified.about?.trim()) parts.push(`current about copy (raw material to rewrite): ${verified.about.trim()}`)
  if (verified.story?.trim()) parts.push(`current story copy (raw material to rewrite): ${verified.story.trim()}`)

  // Demographic + positioning steer (Importer v2 #1): a private read of who this business serves and how
  // it is positioned, so the voice can aim at the right reader. It is a steer, NOT a fact to restate.
  if (verified.demographic?.trim()) {
    parts.push(
      `audience and positioning (an internal steer for your voice, NOT a fact to restate on the page): ${verified.demographic.trim()}`,
    )
  }

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

  // The business's OWN words, to lift from. Kept clearly separate from the verified block so the model
  // can tell "how they talk" (liftable) from "what is true" (authoritative).
  const excerpt = (sourceExcerpt ?? '').trim()
  if (excerpt) {
    parts.push(
      '',
      'SOURCE MATERIAL (their own words, from their website and the operator paste). Lift the good sentences close to verbatim and trim them to fit. Do NOT restate any specific price, phone number, address, opening hours, or rating from it:',
      excerpt.slice(0, REFRAME_EXCERPT_CHARS),
    )
  }

  parts.push('', `Write this in the Frequency voice and call ${REFRAME_TOOL_NAME}.`)
  return parts.join('\n')
}
