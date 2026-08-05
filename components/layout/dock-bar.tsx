'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** The chat trigger portals into this node, so the launcher stays independent of the Vault. */
export const DOCK_CHAT_SLOT_ID = 'fq-dock-chat-slot'
/** A zero-height marker at the END of the right rail's content. The bar rides up to meet it. */
export const RAIL_END_SENTINEL_ID = 'fq-rail-end'

// ── The anchored bottom dock: one bar, two segments ───────────────────────────
//
// Bottom right used to hold TWO unrelated floating objects: the Vault tab flush to the
// corner, and the chat launcher exiled to the middle of the right edge (top-1/2) because
// the two competed for the same corner. Neither reading was good -- a chat button halfway
// down the screen is not where anyone looks for it, and the owner said so.
//
// So they become ONE anchored system with two distinct segments, spanning exactly the
// right rail's column:
//
//   [ ══════ Vault (flex-1) ══════ ][ chat ]
//   ^ left edge = the rail's left edge      ^ right edge = the viewport's right margin
//
// The bar keeps the Vault's old `right-3 w-72` box, which is already the rail-aligned span
// (the rail is w-72 and the dock was built to sit under it). The Vault takes the remaining
// width and the chat takes a fixed square at the far end, so "lines up with the left side of
// the right rail" stays true by construction rather than by a magic number.
//
// WHAT THE SPLIT COSTS: ~48px off the Vault head. At 288px it carried zaps, gems, streak AND
// the rank chip; at ~240px the rank chip no longer fits beside three numbers and a chevron.
// The rank moves into the expanded panel, where it already appeared. Stated plainly because
// the previous comment made a point of the head carrying five numbers at rest -- it now
// carries four, and pretending otherwise would make the next reader trust a stale claim.
//
// THE RIDE-UP. Fixed-to-the-bottom is right while the rail is taller than the viewport, and
// wrong once you reach the rail's end -- the bar then floats in empty space, detached from
// the content it belongs to. So the bar measures a sentinel at the rail's end and translates
// up to meet it, coming to rest against the last rail card instead of the window edge.
// `position: sticky` would express this in one line, but it cannot be used: the bar renders
// from md and the rail column only exists from lg, so a sticky child of the rail would vanish
// on tablets -- and the score is allowed to render exactly once per viewport.
export function DockBar({ vault }: { vault: React.ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState(0)
  /** The rail's measured left edge + width. Null until the first measure, which is why the bar
   *  stays invisible rather than painting at a guessed position for a frame. */
  const [span, setSpan] = useState<{ left: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const bar = barRef.current
    if (!bar) return
    // WHICH RAIL, AND WHETHER IT IS THERE. The member rail is lg+, the admin rail is xl+, and
    // both mount this same bar — so a hardcoded breakpoint could only ever be right for one of
    // them. Ask the ELEMENT instead: a rail inside a `hidden` column reports a zero-size rect,
    // and zero is the tell. That also fixes the original hazard this guard was written for —
    // a zero `bottom` reads as "the rail ended at the top of the screen" and throws the bar a
    // full viewport into the air.
    const sentinel = document.getElementById(RAIL_END_SENTINEL_ID)
    const rail = sentinel?.parentElement
    const rect = rail?.getBoundingClientRect()
    if (!sentinel || !rect || rect.width === 0 || rect.height === 0) {
      setLift(0)
      // Clearing matters on a resize DOWN: a stale span from a wide viewport would strand the
      // bar off-screen. Null hands placement back to the class fallback.
      setSpan(null)
      return
    }

    // How far the rail's end sits ABOVE the bar's resting line (the window's bottom edge).
    // Positive means the rail has ended on screen and the bar should climb by that much — which
    // is the ride-up: on a long page the bar stays pinned to the window while the rail is taller
    // than the viewport, then rises to meet the rail's end as you reach it, and returns as you
    // scroll back. It is scroll-linked on purpose (no transition), so it tracks rather than
    // chases.
    const railBottom = sentinel.getBoundingClientRect().bottom
    setLift(Math.max(0, Math.round(window.innerHeight - railBottom)))

    setSpan({ left: Math.round(rect.left), width: Math.round(rect.width) })
  }, [])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    // The DOM's geometry IS the external system here — this reads the rail's position, which
    // React does not know and cannot derive. The first measurement has to be synchronous or the
    // bar paints pinned to the window for a frame and then jumps to the rail's end.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // The rail's height changes as its widgets load in, and neither scroll nor resize fires
    // for that. Observing the sentinel's offset parent keeps the resting point honest.
    const sentinel = document.getElementById(RAIL_END_SENTINEL_ID)
    const ro = sentinel?.parentElement ? new ResizeObserver(schedule) : null
    if (ro && sentinel?.parentElement) ro.observe(sentinel.parentElement)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [measure])

  return (
    <div
      ref={barRef}
      style={{
        transform: lift ? `translateY(-${lift}px)` : undefined,
        ...(span ? { left: span.left, width: span.width, right: 'auto' } : {}),
      }}
      // ONE TAB, not two objects with a gap between them. The bar owns the surface — the crest,
      // the hairline, the blur — and the two segments sit inside it, divided by a rule rather
      // than by empty space. Previously `gap-2` put 8.5px of canvas between the Vault and the
      // chat button and each drew its own rounded box, so the corner read as two unrelated
      // controls that happened to be adjacent, which is exactly what it looked like.
      // `overflow-hidden` clips both segments to the crest, so the chat button's own square
      // corner cannot poke out past the rounded top.
      // `right-3 w-72` stays as the FALLBACK for md–lg, where the bar renders but no rail
      // exists to measure. At lg+ the inline span overrides both. It must not be `invisible`
      // while unmeasured: on a tablet there is no rail and there never will be, so hiding on a
      // null span would delete the score from that whole range.
      className="pointer-events-none fixed bottom-0 right-3 z-40 hidden w-72 items-stretch overflow-hidden rounded-t-card border-x border-t border-chrome-border bg-chrome/95 backdrop-blur-sm md:flex print:hidden"
    >
      {/* The Vault segment. min-w-0 so its head can shrink rather than push the chat off. */}
      <div className="pointer-events-auto min-w-0 flex-1">{vault}</div>

      {/* The chat segment, divided from the Vault by the rail's own hairline. Same bar, same
          bottom edge, same crest — one anchored system, two jobs. The launcher portals its
          button in here and owns its own tone (muted at rest, full amber on an unread). */}
      <div id={DOCK_CHAT_SLOT_ID} className="pointer-events-auto shrink-0 border-l border-chrome-border" />
    </div>
  )
}
