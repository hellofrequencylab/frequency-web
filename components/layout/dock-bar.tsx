'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** The chat trigger portals into this node, so the launcher stays independent of the Vault. */
export const DOCK_CHAT_SLOT_ID = 'fq-dock-chat-slot'
/** A zero-height marker at the END of the right rail's content. The bar rides up to meet it. */
export const RAIL_END_SENTINEL_ID = 'fq-rail-end'

// ── ONE bar, two segments, ONE open panel ─────────────────────────────────────
//
// The Vault's open state lives in components/sidebar/game-stats-dock.tsx and the chat panel's in
// components/vera/vera-launcher.tsx: two components, two owners, no common parent to hold the
// answer. So both could be open at once — and were, the Vault unfurling underneath a chat panel
// that now covers the same column.
//
// They get one source of truth WITHOUT a context: a window event, the pattern the shell already
// uses for `open-support` (components/support/support-launcher.tsx). Whoever opens announces it;
// everyone else closes. Two properties make that safe rather than a broadcast free-for-all:
//
//   • a segment IGNORES its own announcement, so opening can never close what just opened;
//   • a segment only LISTENS WHILE IT IS OPEN, so "close" is never asked of something already
//     closed. Idempotence is structural here, not a guard someone has to remember to write.
//
// And it does not fight the Esc / outside-click dismissal either side already owns: this calls
// the SAME close each side already exposes, so focus return, the collapse timer and the inbox
// reset all still run exactly once, through one path.

/** Which segment of the bar owns the open panel. */
export type DockSegment = 'vault' | 'chat'

export const DOCK_SEGMENT_OPEN_EVENT = 'fq-dock-segment-open'

/** Announce that `segment` just opened its panel. Safe on every open, including a re-open. */
export function announceDockSegmentOpen(segment: DockSegment): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DOCK_SEGMENT_OPEN_EVENT, { detail: { segment } }))
}

/**
 * Listen for "some OTHER segment opened" and close. Call it from an effect that runs only while
 * your own panel is open, and return the unsubscribe it hands back — that is what makes closing
 * idempotent by construction rather than by a `if (!open) return` inside the handler.
 */
export function onOtherDockSegmentOpen(mine: DockSegment, close: () => void): () => void {
  const handler = (e: Event) => {
    const segment = (e as CustomEvent<{ segment?: DockSegment }>).detail?.segment
    if (!segment || segment === mine) return
    close()
  }
  window.addEventListener(DOCK_SEGMENT_OPEN_EVENT, handler)
  return () => window.removeEventListener(DOCK_SEGMENT_OPEN_EVENT, handler)
}

// ── The bar's measurement, published once ─────────────────────────────────────
//
// The bar already measures the rail on every frame that needs it (see `measure` below). The chat
// panel needs the SAME numbers, because it now covers the rail — and a second ResizeObserver over
// the same <aside> would be a second answer to one question, free to disagree by a frame and to
// double the cost of every scroll. So the measurement is published from where it is TAKEN and the
// panel subscribes; nothing downstream re-measures the rail.
//
// A plain module store rather than a context: DockBar is a shell sibling fed by the `dock` prop
// while the launcher is mounted in the (main) layout, so there is no common provider to hang a
// context on without one of them having to own the other.

export type DockGeometry = {
  /** The BAR's own box. Null below md (the bar is display:none) and on surfaces with no bar at
   *  all. A panel that belongs to the bar takes its width from here, so the two can never drift. */
  bar: { left: number; width: number } | null
  /** How far the RAIL's top edge sits ABOVE the viewport's bottom edge, or null when no rail is
   *  mounted (md–lg, /admin, a folded rail).
   *
   *  Bottom-up on purpose: a panel anchored by `bottom` subtracts its own offset and has its
   *  height, with no second read of `window.innerHeight` at render time. Clamped so a rail taller
   *  than the window cannot push a full-height panel up over the app header. */
  railTopAboveBottom: number | null
  /** True once the bar has ridden up to meet the end of a rail that was TALLER than the window —
   *  i.e. you actually scrolled to the bottom of it. Deliberately FALSE on a short page, where the
   *  bar comes to rest against the rail's end without anyone having scrolled anywhere: lighting a
   *  persistent control on every short page would say "act on me" all day, which is the one thing
   *  furniture must not say. */
  atRailEnd: boolean
}

/** No bar, no rail. ONE frozen instance: `useSyncExternalStore` compares snapshots by identity,
 *  and a freshly built object per read is an infinite render loop. */
const NO_GEOMETRY: DockGeometry = { bar: null, railTopAboveBottom: null, atRailEnd: false }

/** Headroom, in px, that a rail-height panel must leave for the app header. The rail's box starts
 *  at the top of the content row, which on a long page is far above the viewport. */
const HEADER_HEADROOM = 72

let geometry: DockGeometry = NO_GEOMETRY
const listeners = new Set<() => void>()

function sameGeometry(a: DockGeometry, b: DockGeometry): boolean {
  if (a.atRailEnd !== b.atRailEnd || a.railTopAboveBottom !== b.railTopAboveBottom) return false
  if (a.bar === b.bar) return true
  if (!a.bar || !b.bar) return false
  return a.bar.left === b.bar.left && a.bar.width === b.bar.width
}

function publishGeometry(next: DockGeometry): void {
  if (sameGeometry(geometry, next)) return
  geometry = next
  for (const listener of listeners) listener()
}

export function subscribeDockGeometry(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getDockGeometry(): DockGeometry {
  return geometry
}

/** The server render has no DOM to measure, so it gets the same empty answer every time. */
export function getServerDockGeometry(): DockGeometry {
  return NO_GEOMETRY
}

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
      // No rail, but there may still be a BAR (md–lg renders one at its class fallback, and a
      // panel that belongs to it still wants its width). Its own rect is exact here: `left` and
      // `width` are untouched by the ride-up transform, and with no rail there is no lift.
      const barRect = bar.getBoundingClientRect()
      publishGeometry({
        bar: barRect.width > 0 ? { left: Math.round(barRect.left), width: Math.round(barRect.width) } : null,
        railTopAboveBottom: null,
        atRailEnd: false,
      })
      return
    }

    // How far the rail's end sits ABOVE the bar's resting line (the window's bottom edge).
    // Positive means the rail has ended on screen and the bar should climb by that much — which
    // is the ride-up: on a long page the bar stays pinned to the window while the rail is taller
    // than the viewport, then rises to meet the rail's end as you reach it, and returns as you
    // scroll back. It is scroll-linked on purpose (no transition), so it tracks rather than
    // chases.
    const railBottom = sentinel.getBoundingClientRect().bottom
    const lift = Math.max(0, Math.round(window.innerHeight - railBottom))
    setLift(lift)

    const span = { left: Math.round(rect.left), width: Math.round(rect.width) }
    setSpan(span)

    // Publish the SAME numbers the bar just placed itself with. The bar's box is the span rather
    // than a fresh `getBoundingClientRect()` on itself: the span is what the bar is about to BE,
    // and reading its rect in this pass would return the position it is leaving.
    publishGeometry({
      bar: span,
      // Clamped so a rail taller than the window cannot hand a panel a top edge above the header.
      railTopAboveBottom: Math.min(
        Math.round(window.innerHeight - rect.top),
        window.innerHeight - HEADER_HEADROOM,
      ),
      // "You scrolled to the end of the rail", not "the rail happens to end on screen". A rail
      // shorter than the window is at its end from the first paint, and nobody scrolled.
      atRailEnd: lift > 0 && rect.height > window.innerHeight,
    })
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
      // The bar unmounts on /admin and on an editor takeover. A remembered rail would leave the
      // chat panel sized to a column that is no longer on the page.
      publishGeometry(NO_GEOMETRY)
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
      // The crest is ASYMMETRIC by design: `rounded-tl-card` on the outer LEFT where the bar
      // meets open canvas, `rounded-tr-control` on the outer RIGHT where it meets the viewport
      // edge. Both are role tokens, so a skin retunes them together. A corner that turns into
      // open space wants the softer card radius; one that dies against an edge wants the
      // tighter control radius, or it reads as a bubble floating off the side of the screen.
      //
      // The INNER edges either side of the divider stay square — that is what makes this one
      // split button rather than two tabs. `overflow-hidden` enforces it: neither segment can
      // round a corner the bar has not granted it.
      className="pointer-events-none fixed bottom-0 right-3 z-40 hidden w-72 items-stretch overflow-hidden rounded-tl-card rounded-tr-control border-x border-t border-chrome-border bg-chrome/95 backdrop-blur-sm md:flex print:hidden"
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
