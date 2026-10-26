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

import type { BusinessProfile } from '../schema'

export const REFRAME_TOOL_NAME = 'save_reframed_copy'

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
