// ─────────────────────────────────────────────────────────────────────────────
// THE MARKETING DISPLAY LADDER — every fluid display size the public site and the Puck blocks paint,
// in ONE place.
//
// The design system's display roles (`text-display-hero|h1|h2|h3`, app/globals.css) are clamps too, but
// none of them is any of these: the marketing faces were tuned against DAWN's editorial mockups with
// steeper `vw` terms and different floors, so swapping a role in would move every headline on the site.
// Until the lead adds a token per row below, the literal lives HERE and nowhere else, so the design
// change-over (ADR-1737) re-points one file instead of hunting clamps across thirty.
//
// Each value is a size, plus a leading only where the face is set tighter or looser than the global
// heading rule. `leading-display` is the token (0.95); the three looser leadings have no token yet.
//
// The Puck emphasis ladder (`EMPHASIS_SCALE`, lib/page-editor/fields.tsx) and the Space canvas headings
// (components/entity-blocks/space-canvas/space-canvas-block.tsx) read these constants.
// ─────────────────────────────────────────────────────────────────────────────

export const DISPLAY_TYPE = {
  /** The full-viewport landing beat (`PhotoHero minHeight="screen"`). */
  splash: 'text-[clamp(2.5rem,9vw,6rem)]',
  /** A page's own title: `PageHero`, `PhotoHero`. */
  masthead: 'text-[clamp(2.25rem,8vw,4.5rem)]',
  /** The large block heading: the Puck emphasis `lg`, the kit `DisplayHeading size="lg"`, the Banner. */
  feature: 'text-[clamp(2rem,7vw,4.5rem)] leading-display',
  /** A standalone display title block (`DisplayHeadingBlock`). */
  poster: 'text-[clamp(2rem,6vw,3.75rem)] leading-display',
  /** The title over a Space cover photo (the Puck Space hero block). */
  cover: 'text-[clamp(1.875rem,6vw,3.5rem)]',
  /** The section h2: `SectionHeading`, the kit `DisplayHeading`, the Puck emphasis default. */
  section: 'text-[clamp(1.875rem,5.5vw,3rem)]',
  /** The small block heading: the Puck emphasis `sm`. */
  subsection: 'text-[clamp(1.375rem,3.5vw,1.875rem)]',
  /** The typographic interstitial (`Statement`). */
  statement: 'text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]',
  /** One sentence over a photograph (`PhotoBeat`). */
  beat: 'text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05]',
  /** The attributed pull-quote (`PullQuote`). */
  quote: 'text-[clamp(1.75rem,5.5vw,3rem)] leading-[1.08]',
  /** The quote inside a design band (`Band` quote mode). */
  bandQuote: 'text-[clamp(1.5rem,4vw,2.5rem)]',
  /** A big figure in a stats row (design `Section` stats body). */
  figure: 'text-[clamp(2.5rem,6vw,4rem)]',
} as const

export type DisplayTypeRole = keyof typeof DISPLAY_TYPE
