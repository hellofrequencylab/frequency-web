// ─────────────────────────────────────────────────────────────────────────────
// THE MARKETING DISPLAY LADDER — every fluid display size the public site and the Puck blocks paint,
// in ONE place.
//
// The design system's display roles (`text-display-hero|h1|h2|h3`, app/globals.css) are clamps too, but
// none of them is any of these: the marketing faces were tuned against DAWN's editorial mockups with
// steeper `vw` terms and different floors, so swapping a role in would move every headline on the site.
// Each row is now its own token (`--text-mk-*`, app/globals.css, DAWN's values byte for byte), so a
// design sheet retunes the ladder without touching this file or its thirty call sites.
//
// Each value is a size, plus a leading only where the face is set tighter or looser than the global
// heading rule. `leading-display` is the token (0.95); the three looser ones are `--leading-mk-*`.
//
// The Puck emphasis ladder (`EMPHASIS_SCALE`, lib/page-editor/fields.tsx) and the Space canvas headings
// (components/entity-blocks/space-canvas/space-canvas-block.tsx) read these constants.
// ─────────────────────────────────────────────────────────────────────────────

export const DISPLAY_TYPE = {
  /** The full-viewport landing beat (`PhotoHero minHeight="screen"`). */
  splash: 'text-mk-splash',
  /** A page's own title: `PageHero`, `PhotoHero`. */
  masthead: 'text-mk-masthead',
  /** The large block heading: the Puck emphasis `lg`, the kit `DisplayHeading size="lg"`, the Banner. */
  feature: 'text-mk-feature leading-display',
  /** A standalone display title block (`DisplayHeadingBlock`). */
  poster: 'text-mk-poster leading-display',
  /** The title over a Space cover photo (the Puck Space hero block). */
  cover: 'text-mk-cover',
  /** The section h2: `SectionHeading`, the kit `DisplayHeading`, the Puck emphasis default. */
  section: 'text-mk-section',
  /** The small block heading: the Puck emphasis `sm`. */
  subsection: 'text-mk-subsection',
  /** The typographic interstitial (`Statement`). */
  statement: 'text-mk-statement leading-mk-statement',
  /** One sentence over a photograph (`PhotoBeat`). */
  beat: 'text-mk-beat leading-mk-beat',
  /** The attributed pull-quote (`PullQuote`). */
  quote: 'text-mk-quote leading-mk-quote',
  /** The quote inside a design band (`Band` quote mode). */
  bandQuote: 'text-mk-band-quote',
  /** A big figure in a stats row (design `Section` stats body). */
  figure: 'text-mk-figure',
} as const

export type DisplayTypeRole = keyof typeof DISPLAY_TYPE
