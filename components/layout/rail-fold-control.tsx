'use client'

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { railFoldControlLabel, type RailSide, type RailState } from '@/lib/layout/rail-fold'

// ── THE ONE RAIL CONTROL ──────────────────────────────────────────────────────────────────
//
// DAWN § "Rail controls sit at the foot":
//
//   "Every open/close control in the app is the same quiet thing: a 26px borderless glyph at
//    the BOTTOM of the rail it belongs to, at --color-text-subtle, warming to
//    --color-text-muted on hover. Never a bordered button, never at the top — at the head of a
//    rail it competed with the first real row for attention, and folding a rail is something a
//    member does rarely."
//
// So: one component, both rails, both directions. `h-6 w-6` is 1.5rem, and this app's density
// root is 106.25% (1rem = 17px) — 25.5px, which is DAWN's 26 to within half a pixel WITHOUT an
// arbitrary `h-[26px]` (that would add to the `raw-px-arbitrary` ratchet, which may only shrink).
// The glyph inside is `h-3.5 w-3.5` = 14.875px, DAWN's 14.
//
// The panel glyphs are DAWN's own (`panel-left-open` / `panel-left-close` in nav-rail.jsx),
// mirrored for the right rail. The chevrons the right rail used before pointed at a DIRECTION;
// these name the THING — which is what a control that both folds and unfolds needs to do.
export function RailFoldControl({
  side,
  showing,
  onPress,
  className = '',
}: {
  /** Which rail this control belongs to. Picks the glyph pair and names the rail out loud. */
  side: RailSide
  /** How that rail is rendering right now — the control shows the press's DESTINATION. */
  showing: RailState
  onPress: () => void
  /** Placement only (the foot row's alignment / sticky offset). Never style. */
  className?: string
}) {
  const label = railFoldControlLabel(side, showing)
  const Icon =
    side === 'left'
      ? showing === 'open'
        ? PanelLeftClose
        : PanelLeftOpen
      : showing === 'open'
        ? PanelRightClose
        : PanelRightOpen

  return (
    <button
      type="button"
      onClick={onPress}
      title={label}
      aria-label={label}
      // Borderless, no background, no ring: `text-subtle` warming to `text-muted`, and nothing
      // else. `rounded-control` rather than a step literal so a skin retunes it with the other
      // controls (Midnight sharpens it). The focus ring is the shared chrome ring — a control
      // with no resting box still has to be findable by keyboard.
      className={`inline-flex h-6 w-6 items-center justify-center rounded-control text-subtle transition-colors hover:text-muted ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}
