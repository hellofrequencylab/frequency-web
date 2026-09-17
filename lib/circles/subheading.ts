// ── THE LINE UNDER A CIRCLE'S NAME (owner ruling, 2026-09-17) ───────────────────────────────────
//
// *"Change the 'CIRCLE' eyebrow to a pill button in the corner. Create a subheading line under the
// circle name."*
//
// The header's subtitle slot used to hold the PLACE — "Encinitas", or nothing at all for an online
// Circle. That is a fact the band repeats three inches lower (the In Person / Online chip, the Hub
// row, the venue map block), and it answered a question nobody arrives with. Moving the eyebrow out
// of the lockup freed the line, and this is what goes on it: what this Circle IS.
//
// PURE, so the rule is unit-testable without a render (the lib/circles/*-gate idiom, ADR-841/843).
//
// THREE SOURCES, IN ORDER, AND THE ORDER IS THE POINT:
//
//   1. A SPACE CIRCLE gets a fixed line naming its function, because it HAS no words of its own:
//      `ensure_space_circle` writes a name and nothing else, so `about` is NULL on all 21 Space
//      Circles in production (measured 2026-09-17) and always will be on a new one. A blank
//      subheading on a Space's own hub is the worst of the three outcomes, and it is the one the
//      about-first order would produce every time.
//   2. THE CIRCLE'S OWN WORDS, when it has any. First sentence only: `about` is a paragraph on the
//      page already (CollapsibleAbout), and repeating the whole of it under the title would print
//      the same text twice within one scroll.
//   3. THE PLACE, as the fallback the slot used to hold unconditionally. A Circle with no about is
//      exactly the case where "where does this meet" is the most useful thing left to say.
//
// EMPTY IS A VALID ANSWER (an online Circle with no about and no city). The caller renders no
// subtitle at all rather than a placeholder, which is what PageHero already does with `undefined`.
//
// VOICE (docs/CONTENT-VOICE.md §10): plain sentences, no em dashes, and no narrating what the
// reader feels about a room they have not entered yet.

/** The facts the rule reads. A loose shape on purpose: it is fed from `CircleDetail`, from a
 *  `SpaceCircle` row, and from tests, and none of the three should have to build a class. */
export interface CircleSubheadingFacts {
  /** `circles.about`, the Circle's own description. */
  about?: string | null
  /** `circles.type`: an online Circle has no place to name. */
  type?: string | null
  neighborhood?: string | null
  city?: string | null
  /** `circles.is_space_primary` (ADR-1391). */
  isSpaceCircle?: boolean
  /** The owning Space's display name, for the Space Circle line. */
  spaceName?: string | null
}

/** The longest first-sentence we will print. Past this the line wraps to three on a phone and stops
 *  reading as a subheading. Cut on a word boundary, never mid-word. */
export const CIRCLE_SUBHEADING_MAX = 120

/** The first sentence of a block of prose, trimmed to `CIRCLE_SUBHEADING_MAX`.
 *
 *  "First sentence" is a full stop, question mark or exclamation followed by whitespace. A decimal
 *  ("5.30pm") has no space after the stop, so it does not split the line. Prose with no terminator
 *  at all is one sentence, which is the common case for a one-line `about`. */
export function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const match = clean.match(/^(.+?[.!?])(\s|$)/)
  const sentence = (match ? match[1] : clean).trim()
  if (sentence.length <= CIRCLE_SUBHEADING_MAX) return sentence
  const cut = sentence.slice(0, CIRCLE_SUBHEADING_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Where this Circle meets, as a sentence. Empty when there is nothing true to say. */
export function circlePlaceLine(facts: CircleSubheadingFacts): string {
  if (facts.type === 'online') return 'Meets online.'
  const where = [facts.neighborhood, facts.city]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ')
  return where ? `Meets in person in ${where}.` : ''
}

/** The one line that renders under a Circle's name. `''` means render no subtitle. */
export function circleSubheading(facts: CircleSubheadingFacts): string {
  if (facts.isSpaceCircle) {
    const space = (facts.spaceName ?? '').trim()
    return space
      ? `News, events and everything else going on at ${space}.`
      : 'News, events and everything else going on here.'
  }

  const about = (facts.about ?? '').trim()
  if (about) return firstSentence(about)

  return circlePlaceLine(facts)
}
