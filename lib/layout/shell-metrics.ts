// ── THE APP SHELL'S ROW GEOMETRY, in one place ────────────────────────────────────────────
//
// The shell lays its page row out as: [left rail] gap [CONTENT] gap [right rail]. The CONTENT
// column is `flex-1 min-w-0`, so it has NO width of its own — it is whatever is left over, and it
// changes with the viewport AND with which rails are currently visible (they hide at different
// breakpoints).
//
// 🔴 WHY THIS FILE EXISTS. The Business Space claim page (app/spaces/claim/[token]) renders
// OUTSIDE the shell — no rails — but has to be the same width as that content column, because it
// shows the same page body and the owner flips between the two. It was given a fixed
// `max-w-[69rem]`, derived by hand from the 105rem case. That is within 4px at a 1680px viewport
// and **232px too wide at ~1000px**, where the right rail has already hidden. A constant cannot
// track a fluid column; the owner reported it three times.
//
// So the claim page now DERIVES its width from these values instead of restating them, and
// lib/layout/shell-metrics.test.ts pins them against the shell's own literals — if someone
// widens a rail in app-shell.tsx and does not update this file, the test fails rather than the
// claim page silently drifting again.

/** The row's own max width. `max-w-[105rem]` on the shell's flex row. */
export const SHELL_ROW_MAX = '105rem'

/** Left navigation rail: `w-48` = 12rem. `hidden md:flex`, so it costs nothing below `md`. */
export const LEFT_RAIL = 12 // rem

/** Right rail column. Its width is an INLINE STYLE, not a class: 288px open / 56px collapsed.
 *  18rem is the 288px default. `hidden lg:flex`, so it costs nothing below `lg`. */
export const RIGHT_RAIL = 18 // rem

/** `lg:ml-3` on the right rail column — 0.75rem, added so the content↔right-rail gap visually
 *  matches the left one (ADR-404). It is real horizontal space and must be subtracted too. */
export const RIGHT_RAIL_ML = 0.75 // rem

/** The row gap: `gap-8` (2rem), widening to `lg:gap-10` (2.5rem). Applies once per rail. */
export const GAP = 2 // rem, below lg
export const GAP_LG = 2.5 // rem, at lg and up

/** What the rails + gaps take OUT of the row's inner width, per breakpoint band. The content
 *  column is the remainder, so these are exactly what the claim page must subtract to match.
 *
 *   below md   both rails hidden                                          -> 0
 *   md..lg     left rail + one gap                                        -> 12 + 2      = 14
 *   lg and up  left + gap + right + its ml-3 + gap                        -> 12+2.5+18+0.75+2.5 = 35.75
 */
export const RAILS_MD = LEFT_RAIL + GAP // 14rem
export const RAILS_LG = LEFT_RAIL + GAP_LG + RIGHT_RAIL + RIGHT_RAIL_ML + GAP_LG // 35.75rem

/**
 * Tailwind classes for a column that is EXACTLY as wide as the shell's content column, centred.
 *
 * Must be used INSIDE a wrapper that reproduces the shell row's own box —
 * `mx-auto w-full max-w-[105rem] px-4 sm:px-6 lg:px-8` — because the `100%` in these calcs is
 * that wrapper's inner width, which is the same quantity the shell's flex row divides up. Using
 * `100vw` instead would be off by the scrollbar and by the row's own padding.
 *
 * Centred rather than left-offset (owner's call): the claim page has no rails, so leaving a
 * 12rem hole where the nav would be reads as a broken layout rather than as alignment.
 *
 * ⚠️ WRITTEN OUT AS LITERALS, never interpolated. Tailwind generates utilities by scanning source
 * text for complete class strings, so `md:max-w-[calc(100%-${RAILS_MD}rem)]` would compile to the
 * right string at runtime and produce NO CSS at build time — the column would silently fall back
 * to full width, which is the exact bug this file exists to end. The numbers above stay as the
 * source of truth and shell-metrics.test.ts asserts these literals still equal them.
 */
export const SHELL_CONTENT_WIDTH_CLASS =
  'mx-auto w-full md:max-w-[calc(100%-14rem)] lg:max-w-[calc(100%-35.75rem)]'

/** The shell row's own box, so a page outside the shell starts from the identical container. */
export const SHELL_ROW_CLASS = 'mx-auto w-full max-w-[105rem] px-4 sm:px-6 lg:px-8'
