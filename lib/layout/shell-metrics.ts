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

// (There was a `SHELL_ROW_MAX = '105rem'` export here with no importers anywhere. The row's max
// width already lives in SHELL_ROW_CLASS at the bottom of this file, which is what pages actually
// use; a second, unused spelling of the same number is a place for the two to disagree.)

/** Left navigation rail: `w-48` = 12rem. `hidden md:flex`, so it costs nothing below `md`.
 *
 *  This is the OPEN rail, and open is what the claim page must match. Both rails now run DAWN's
 *  three-position fold ladder (lib/layout/rail-fold.ts), so a member can fold either one to a
 *  56px strip — but that is a PER-VIEWER standing instruction, not the shell's geometry. The
 *  claim page renders for a visitor who has no rails at all and no instruction to read, so it
 *  keeps deriving from the open widths. (Same reasoning the right rail already used: its folded
 *  56 has never been part of RIGHT_RAIL_PX either.) */
export const LEFT_RAIL = 12 // rem

/** Either rail, FOLDED: the `w-14` strip. Deliberately NOT a number here — it is not part of any
 *  claim-page calc, and stating it as "56" would repeat the unit mistake this file exists to end:
 *  `w-14` is 3.5rem, which is 59.5px at this app's 17px root, while the right rail's COLUMN
 *  carries a literal inline `56`. The left rail's strip uses the same `w-14` class the right
 *  rail's strip has always used, so the two sides fold to the same STEP; the column's 56 is a
 *  separate, pre-existing inline value. shell-metrics.test.ts pins both spellings. */
export const RAIL_STRIP_CLASS = 'w-14'

/** Right rail column, in PIXELS. Its width is an INLINE STYLE, not a Tailwind class:
 *  `settings.open ? settings.width : railCollapsed ? 56 : 288`.
 *
 *  🔴 STAYS IN PIXELS. It was first written as `18 // rem`, converting 288px at the browser
 *  default of 16px/rem. This app sets `html { font-size: 106.25% }` (globals.css) — the root is
 *  **17px** — so 18rem is 306px and the claim column came out **18px too narrow** at `lg`. Worse,
 *  the drift guard asserted `RIGHT_RAIL === 18` and so was green while the page was wrong.
 *
 *  CSS `calc()` mixes units natively, so the correct move is not a better conversion but NO
 *  conversion: keep the rem-based rails in rem, keep this one in px, and let the browser resolve
 *  both against whatever the root size happens to be. That also survives a skin retuning
 *  `--density-root`, which any hardcoded rem figure would silently break. */
export const RIGHT_RAIL_PX = 288

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
 *   md..lg     left rail + one gap                                        -> 12 + 2 = 14rem
 *   lg and up  left + gap + right + its ml-3 + gap                        -> 17.75rem AND 288px
 *
 *  ⚠️ THE lg BAND DOES NOT REDUCE TO ONE NUMBER, and an earlier version of this block wrote it as
 *  `12+2.5+18+0.75+2.5 = 35.75` — the exact reverted arithmetic RIGHT_RAIL_PX exists to prevent,
 *  sitting directly above the constant that corrects it. The right rail is 288 PIXELS; folding it
 *  in as "18rem" is only true at a 16px root, and this app's root is 17px. The rem part and the px
 *  part stay separate all the way into the calc().
 */
export const RAILS_MD = LEFT_RAIL + GAP // 14rem — all rem, converts cleanly

/** The REM part of the lg subtraction. The right rail's 288px is added separately in the calc,
 *  because it is an absolute pixel width and must not be folded into a rem total. */
export const RAILS_LG_REM = LEFT_RAIL + GAP_LG + RIGHT_RAIL_ML + GAP_LG // 17.75rem

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
  'mx-auto w-full md:max-w-[calc(100%-14rem)] lg:max-w-[calc(100%-17.75rem-288px)]'

/** The shell row's own box, so a page outside the shell starts from the identical container. */
export const SHELL_ROW_CLASS = 'mx-auto w-full max-w-[105rem] px-4 sm:px-6 lg:px-8'
