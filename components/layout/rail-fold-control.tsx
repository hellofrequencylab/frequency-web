'use client'

import { railFoldControlLabel, railHandleId, type RailSide, type RailState } from '@/lib/layout/rail-fold'

// ── THE ONE RAIL CONTROL — a handle on the rail's EDGE ────────────────────────────────────
//
// OWNER, 2026-08-05, off a live screenshot: "a subtle handle in the vertical middle of the rail's
// edge" — the drag-handle affordance a collapsible panel wears, centred on the screen edge rather
// than parked at the bottom. This REPLACES the previous law (DAWN § "Rail controls sit at the
// foot": a 26px glyph at the bottom of the rail). Both rails move together; nothing is left at
// the foot, because two ways to fold one rail is worse than either.
//
// WHAT THE MOVE BUYS, beyond the owner's read:
//   • The foot control had to dodge furniture. DockBar is `fixed bottom-0` and ~48px tall, and a
//     `sticky` offset does not stack against a `fixed` sibling — so the control shipped at
//     `bottom-4`, INSIDE the bar, invisible and unclickable, and had to be re-pinned to
//     `bottom-14` with a pair of constants and a drift test to hold the clearance. The
//     bottom corners are the busiest part of this layout (Vault, chat, account dock, toasts); the
//     middle of the edge is empty. That whole class of problem left with the control, which is
//     why lib/layout/shell-metrics.ts no longer carries DOCK_BAR_H_PX / RAIL_FOLD_STICKY_* /
//     railFoldClearsDock().
//   • It is now ON the seam it acts on. The thing you press to move an edge sits on that edge.
//
// STAYS TRUE from the old control: one component, both rails, both directions; borderless and
// quiet (`chrome-border` at rest, warming on hover/focus); the label names the SIDE and the
// destination, because "Collapse" alone does not say which of two rails is about to move.
//
// SUBTLE, NOT INVISIBLE. The visible mark is a 4px rounded bar; the BUTTON around it is
// `h-16 w-5` (~68 x 21px), so a pointer and a coarse touch target both find it while the ink
// stays quiet. Hit area and ink are allowed to differ — that is what makes a subtle control
// usable rather than a dare.

/** The visible mark, hoisted ABOVE the `<button>` on purpose: the `raw-button-bg` ratchet reads a
 *  500-character window FORWARD from each `<button`, so a `bg-*` token written inside the tag
 *  counts as a hand-rolled button fill even when it is a 4px hairline. Same trick, same reason as
 *  the constants at the top of components/vera/vera-launcher.tsx. */
const HANDLE_MARK =
  'h-10 w-1 rounded-pill bg-chrome-border transition-colors duration-150 group-hover:bg-border-strong group-focus-visible:bg-border-strong'

/** The pressable box around it: bigger than the mark, no fill of its own, centred on the seam. */
const HANDLE_BOX =
  'group pointer-events-auto flex h-16 w-5 items-center justify-center rounded-control'

/**
 * The rail's fold handle, placed on its edge and centred ON THE SCREEN.
 *
 * 🔴 "VERTICAL MIDDLE" MEANS THE VIEWPORT'S MIDDLE, NOT THE RAIL'S. The rails are flex children
 * of the page row, so their box is as tall as the whole page — on a long feed that is many
 * screens, and a handle centred in the rail's own box would sit thousands of pixels below the
 * fold. Hence the shape below: an absolutely-positioned strip down the rail's edge, holding a
 * `sticky top-0 h-screen` box that centres its child. While any part of the rail is on screen the
 * handle sits at the middle of the window; past the rail's ends it comes to rest with the rail,
 * because sticky cannot leave its container. No scroll listener, no measurement.
 *
 * The strip is `pointer-events-none` and only the button re-enables them, so a 21px-wide dead
 * zone is never laid over the gutter between the rail and the content.
 */
export function RailEdgeHandle({
  side,
  showing,
  onPress,
}: {
  /** Which rail this handle belongs to. Picks the edge, and names the rail out loud. */
  side: RailSide
  /** How that rail is rendering right now — the label states the press's DESTINATION. */
  showing: RailState
  onPress: () => void
}) {
  const label = railFoldControlLabel(side, showing)

  return (
    // The edge it straddles: the LEFT rail's handle sits on its right border, the RIGHT rail's on
    // its left. `-right-2.5` / `-left-2.5` centre the 21px box on the hairline, half in the rail
    // and half in the gutter, which is what makes it read as belonging to the seam rather than to
    // either side. The id is on this box (not the button) so DockBar can hand focus back to the
    // rail when a fold takes the bar — and its one button — off the screen.
    <div
      id={railHandleId(side)}
      className={`pointer-events-none absolute inset-y-0 z-20 w-5 ${side === 'left' ? '-right-2.5' : '-left-2.5'}`}
    >
      <div className="sticky top-0 flex h-screen items-center">
        <button
          type="button"
          onClick={onPress}
          title={label}
          aria-label={label}
          aria-expanded={showing === 'open'}
          className={HANDLE_BOX}
        >
          {/* Decorative: the button already carries the name. A glyph here would be a second
              thing to read on a control whose whole job is to stay quiet until you look for it. */}
          <span aria-hidden className={HANDLE_MARK} />
        </button>
      </div>
    </div>
  )
}
