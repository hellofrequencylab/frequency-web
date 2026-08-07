'use client'

import { railFoldControlLabel, railHandleId, type RailSide, type RailState } from '@/lib/layout/rail-fold'

// ── THE ONE RAIL CONTROL — a micro tick on the corner of the rail's TAB ───────────────────────
//
// OWNER, 2026-08-05, off a live screenshot: the mid-edge handle shipped hours earlier is gone.
// "The fold control becomes a micro tick on the CORNER of each rail menu tab." Nothing floats on
// the seam any more:
//
//   LEFT rail  → the profile box at the bottom (avatar + name + role chip), top-RIGHT corner.
//   RIGHT rail → the dock tab at the bottom (components/layout/dock-bar.tsx), top-LEFT corner.
//
// Each tick sits on the corner NEAREST THE SEAM its press moves, so the control points at the
// edge it acts on without standing on it.
//
// ── WHY THE TAB, AND WHY THAT KILLS THE OLD BUG CLASS ────────────────────────────────────────
//
// The FOOT control that predated the mid-edge handle failed for a geometric reason worth stating
// in full, because this placement is back in the same corner: it shipped `sticky bottom-4` while
// DockBar is `fixed bottom-0` and ~52px tall. A sticky offset does not stack against a fixed
// SIBLING — they are unrelated boxes — so the control painted UNDER the bar: invisible and
// unclickable on every rail page. The fix at the time was a literal clearance (`bottom-14`) held
// up by a pair of constants in lib/layout/shell-metrics.ts and a drift test.
//
// The tick needs none of that, and the reason is structural rather than lucky: it is a CHILD of
// the tab, not a sibling of it. A child cannot be underneath its own parent's background, and it
// travels with the tab automatically — up when the Vault panel unfurls, up when the profile
// dock's quick actions rise, up when the bar rides to meet the rail's end. There is no clearance
// to hold because there are no longer two independently-positioned boxes to hold it between, so
// the retired constants stay retired (see the note at the foot of shell-metrics.ts).
//
// ── ONE CONTROL, ONE MEANING ─────────────────────────────────────────────────────────────────
//
// The tick sits ON a tab that has its own press (open the account dock / open the Vault). It is
// deliberately NOT a smart control that sometimes does the tab's job: a press whose meaning
// depends on state you cannot see is worse than two controls. So the rule is flat, in all four
// states — rail open or folded, tab idle or active:
//
//     pressing the tick folds or unfolds THIS rail. Always. Nothing else.
//
// Three things keep that boundary legible rather than a trap:
//   • it is not NESTED in the tab's button — it is a sibling, absolutely positioned over the
//     tab's corner, so there is no event to bubble and no click to steal. `stopPropagation` is
//     belt-and-braces for a future wrapper that makes the whole tab pressable;
//   • the accessible name states the SIDE and the DESTINATION ("Fold the menu to a strip"), which
//     no tab in this app is called, so a screen reader never announces two identical controls;
//   • at rest it is a bare hairline dash; on hover/focus it lights its OWN rounded ground, so a
//     pointer sees where the tick ends and the tab begins before committing to the press.
//
// ── INK IS MICRO. THE TARGET IS NOT. ─────────────────────────────────────────────────────────
//
// At this app's 17px root (globals.css `font-size: var(--density-root, 106.25%)`):
//
//   ink   `h-1 w-2.5`  = 4.25 × 10.625px — a quarter the AREA of the mid-edge mark it replaces
//                        (`h-10 w-1`, 42.5 × 4.25px) and a quarter of its longest side.
//   hit   `tap-target` = the live `--tap-min` on BOTH axes: 32px density floor with a mouse,
//                        44px on a coarse pointer, and 26 → 56px across the generation presets.
//
// The floor goes on the WRAPPER — here the `<button>` — and never on the visible mark, which is
// the pattern components/ui/checkbox.tsx spells out: a min-size on a mark that IS the visible box
// grows the BOX, so an unlabelled checkbox drew a 44px square around a 12px tick. The mark here
// is a decorative `<span>` inside the pressable box, so the two are free to differ, which is what
// makes a subtle control usable instead of a dare.

/** The visible mark, hoisted ABOVE the `<button>` on purpose: the `raw-button-bg` ratchet reads a
 *  500-character window FORWARD from each `<button`, so a `bg-*` token written inside the tag
 *  counts as a hand-rolled button fill even when it is a four-pixel hairline. Same trick, same
 *  reason as the constants at the top of components/vera/vera-launcher.tsx.
 *
 *  The diagonal offset is what keeps the ink INSIDE the tab while the hit box straddles the
 *  corner: the button is centred ON the corner point, so a mark centred in the button would be
 *  bisected by it and read as floating off the crest. Two spacing units = 8.5px in on both axes,
 *  and it is a FIXED distance rather than a fraction, so the ink does not wander when `--tap-min`
 *  changes generation.
 *
 *  WHY 8.5 AND NOT MORE, since more would clear the corner curve better. It is the CEILING, not a
 *  preference. The tightest generation is `bold` (`--tap-min: 26px`), where a box centred on the
 *  corner leaves a 13px quadrant inside the tab; the mark is 10.625px wide, so its centre cannot
 *  sit deeper than ~7.7px without part of the ink hanging outside its own pressable box — which is
 *  the one thing a subtle control must not do. 8.5 keeps it within a pixel of that everywhere and
 *  is comfortably inside the tab on the default and compact skins (`--radius-card` 0.625–1.125rem).
 *  On the roundest presets (`playful`, `kids-early`: 1.5–1.75rem) the mark rides the shoulder of
 *  the curve rather than sitting flat inside it — stated rather than glossed, because it is a real
 *  difference and it reads as a notch ON the corner, which is what was asked for. */
const TICK_MARK_BASE =
  'h-1 w-2.5 rounded-pill bg-chrome-border transition-colors duration-150 group-hover:bg-border-strong group-focus-visible:bg-border-strong'

/** Which way "into the tab" points, per side. */
const TICK_MARK_INSET: Record<RailSide, string> = {
  left: '-translate-x-2 translate-y-2',
  right: 'translate-x-2 translate-y-2',
}

/** The pressable box: no fill at rest, its own quiet ground on hover/focus (that ground IS the
 *  boundary a pointer needs), and the tap-target floor on both axes. */
const TICK_BOX =
  'group pointer-events-auto absolute z-20 flex tap-target items-center justify-center rounded-control transition-colors duration-150 hover:bg-chrome-hover focus-visible:bg-chrome-hover'

/** Centred ON the tab's corner point, and centred by TRANSLATE rather than by a negative inset so
 *  the centre stays put as `--tap-min` grows: `right-0 translate-x-1/2` puts the box's right edge
 *  at the tab's right edge and then shifts it right by half its own width, which lands the centre
 *  on the edge for any width. A quarter of the box lands inside the tab, a quarter over the rail's
 *  gutter, and the two remaining quarters above the crest. */
const TICK_CORNER: Record<RailSide, string> = {
  left: 'right-0 top-0 translate-x-1/2 -translate-y-1/2',
  right: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2',
}

/**
 * The rail's fold tick, mounted on the corner of that rail's bottom tab.
 *
 * 🔴 THE PARENT MUST BE A POSITIONED BOX. Both live mounts already are, without adding anything:
 * the left rail's account dock is `sticky bottom-0` and the dock bar is `fixed bottom-0`, and both
 * `sticky` and `fixed` establish a containing block for an absolutely positioned child. A `relative`
 * added "to be safe" would be dead text of exactly the kind check:bridge exists to catch.
 *
 * The `id` is on the BUTTON (it used to be on a wrapper box, back when the wrapper was the
 * positioned strip). DockBar looks it up to hand focus back when a fold takes the Vault segment —
 * and whatever focus was sitting in it — off the screen; a button is focusable, so the lookup no
 * longer has to go hunting for a child.
 */
export function RailFoldTick({
  side,
  showing,
  onPress,
  className = '',
}: {
  /** Which rail this tick folds. Picks the corner, and names the rail out loud. */
  side: RailSide
  /** How that rail is rendering right now — the label states the press's DESTINATION. */
  showing: RailState
  onPress: () => void
  /** Extra classes for the ONE thing placement cannot derive: the right rail exists only at lg+,
   *  while the bar it rides on renders from md, so that mount passes `hidden lg:flex`.
   *
   *  That composes with the `flex` in TICK_BOX rather than fighting it, and the reason is source
   *  order in the compiled sheet, which was checked rather than assumed: Tailwind emits `.flex`,
   *  then `.hidden`, then the `lg` block. So `hidden` wins below lg and `lg:flex` wins above it. */
  className?: string
}) {
  const label = railFoldControlLabel(side, showing)

  return (
    <button
      type="button"
      id={railHandleId(side)}
      onClick={(e) => {
        // The tick is a sibling of the tab's own button, not a child of it, so nothing bubbles
        // today. This is here for the day someone makes the whole tab pressable: one press, one
        // meaning, and the fold must never arrive as a side effect of opening a panel.
        e.stopPropagation()
        onPress()
      }}
      title={label}
      aria-label={label}
      aria-expanded={showing === 'open'}
      className={`${TICK_BOX} ${TICK_CORNER[side]} ${className}`}
    >
      {/* Decorative: the button already carries the name. A glyph here would be a second thing to
          read on a control whose whole job is to stay quiet until you look for it. */}
      <span aria-hidden className={`${TICK_MARK_BASE} ${TICK_MARK_INSET[side]}`} />
    </button>
  )
}
