'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { railHandleId } from '@/lib/layout/rail-fold'

/** The chat trigger portals into this node, so the launcher stays independent of the Vault. */
export const DOCK_CHAT_SLOT_ID = 'fq-dock-chat-slot'
/** A zero-height marker at the END of the right rail's content. The bar rides up to meet it. */
export const RAIL_END_SENTINEL_ID = 'fq-rail-end'

/**
 * The head height BOTH bottom tabs wear — this bar on the right, and the account dock at the foot
 * of the left rail (components/layout/app-shell.tsx § ProfileCard).
 *
 * Owner, 2026-08-05: "both tabs the same height, left and right." They were not: the Vault head
 * was `h-10` (42.5px) while the identity bar was a `w-11` avatar in `py-3.5` — 72px, two thirds
 * taller — under a comment that claimed it was "matched in height to the right stats bar". A
 * claim in prose is exactly how two numbers drift; this is the class both sides import, and
 * dock-bar.test.ts fails if either hardcodes a height instead.
 *
 * `h-11` (46.75px at this app's 17px root) rather than the old `h-10`: it is the smallest step
 * that still fits the left tab's two lines (name + role badge) beside a 38px avatar without
 * crushing them, and the right tab's three counters only gain room.
 */
export const DOCK_HEAD_H_CLASS = 'h-11'

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

/** What travels on the channel. 'dismissed' is the BAR speaking rather than a segment: the bar
 *  itself is going off the screen (the member folded the rail), so whoever is open must close.
 *  It is deliberately the same event and the same word as an open announcement, because the
 *  receiving rule is identical — "somebody who is not me claimed the corner, stand down" — and a
 *  second channel would be a second place for the close paths to diverge. */
export type DockAnnouncement = DockSegment | 'dismissed'

export const DOCK_SEGMENT_OPEN_EVENT = 'fq-dock-segment-open'

/** Announce that `segment` just opened its panel. Safe on every open, including a re-open. */
export function announceDockSegmentOpen(segment: DockSegment): void {
  announce(segment)
}

/**
 * Announce that the BAR is leaving the screen, so both segments close.
 *
 * The one caller is DockBar, when a fold takes the bar away (see `dockDismissalDue`). It rides
 * the open channel because every listener already treats "not me" as "close", so the Vault and
 * the chat panel each run the SAME `close()` the Esc key and the outside click run — focus
 * return, the collapse timer and the inbox reset happen once, through one path, rather than
 * being re-implemented for the fold.
 */
export function announceDockDismissed(): void {
  announce('dismissed')
}

function announce(segment: DockAnnouncement): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DOCK_SEGMENT_OPEN_EVENT, { detail: { segment } }))
}

/**
 * Listen for "somebody who is not me claimed the corner" and close. Call it from an effect that
 * runs only while your own panel is open, and return the unsubscribe it hands back — that is what
 * makes closing idempotent by construction rather than by a `if (!open) return` inside the handler.
 *
 * The filter is on the SENDER, not on a list of known senders: anything that is not `mine` closes
 * me. That is what lets the bar's own 'dismissed' reach both segments without either of them
 * learning a second rule.
 */
export function onOtherDockSegmentOpen(mine: DockSegment, close: () => void): () => void {
  const handler = (e: Event) => {
    const segment = (e as CustomEvent<{ segment?: DockAnnouncement }>).detail?.segment
    if (!segment || segment === mine) return
    close()
  }
  window.addEventListener(DOCK_SEGMENT_OPEN_EVENT, handler)
  return () => window.removeEventListener(DOCK_SEGMENT_OPEN_EVENT, handler)
}

/**
 * Does this change to the fold owe the segments a dismissal?
 *
 * Three inputs, because two of them are traps:
 *
 *   • `wasFolded → folded` must be a TRANSITION. A page that ARRIVES with the rail folded has
 *     nothing open to close, and announcing on mount would slam shut a panel that a `?chat=…`
 *     deep link is opening on the same tick (components/vera/vera-launcher.tsx reads the URL in
 *     its own mount effect).
 *   • `barWidth` is the one that keeps a tablet member from being trapped. The fold hides the bar
 *     at lg and up, where the rail it belongs to actually exists. In the md–lg band there is NO
 *     right rail (`hidden lg:flex`) and therefore no fold control on screen either — so a standing
 *     'strip' instruction set on a desktop must NOT take the bar away there, or the member loses
 *     the Vault and Messages with no affordance anywhere to bring them back. The bar stays put in
 *     that band, so nothing was dismissed and nothing should be announced. Zero width is the tell,
 *     the same tell `measure()` uses below: a `display:none` box reports all zeros.
 */
export function dockDismissalDue(wasFolded: boolean, folded: boolean, barWidth: number): boolean {
  return folded && !wasFolded && barWidth === 0
}

/**
 * Which segment, if any, OPENS when you reach the end of the rail.
 *
 * Owner, 2026-08-05: "scroll-to-bottom OR click opens the Vault." The bar already measures the
 * rail's end to ride up and meet it, and publishes that as `atRailEnd` — so this is a decision
 * about what to do with a fact the bar already has, not a new listener.
 *
 * 🔴 IT IS A SINGLE VALUE, NOT A FLAG PER SEGMENT, and that is the whole point. The two segments
 * are mutually exclusive (see the announcement channel above): if both claimed the rail's end,
 * reaching it would make each announce and close the other, and which one survived would come
 * down to subscription order. One owner, decided in one place, is the only coherent shape.
 *
 * `null` restores the old behaviour (reaching the end does nothing).
 */
export const RAIL_END_OPENS: DockSegment | null = 'vault'

/**
 * Should reaching the rail's end open its segment on THIS notification?
 *
 * 🔴 THE RISING EDGE IS LOAD-BEARING. `atRailEnd` stays true for as long as you sit at the end of
 * the rail, and the geometry store notifies on every scroll frame that changes anything — so a
 * bare `if (atRailEnd) open()` re-opens the panel on the next scroll pixel after the member
 * closes it. That is the "you close it, you are still at the end of the rail, it comes back"
 * hostility the launcher's own comment warned about, and it is why the auto-open branch that sat
 * wired-but-inert for months could not simply be switched on.
 *
 * So: open on the TRANSITION into the rail's end, and not again until you have left and returned.
 */
export function railEndOpenDue(wasAtEnd: boolean, atEnd: boolean): boolean {
  return atEnd && !wasAtEnd
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
  /** The BAR's own box. Null below md (the bar is display:none), on surfaces with no bar at all,
   *  and at lg+ while a FOLDED rail hides it — all three are the same fact, "there is no bar on
   *  screen to hang anything off", and all three are read the same way: a zero-size rect.
   *  A panel that belongs to the bar takes its width from here, so the two can never drift. */
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

/** The SSR-safe layout effect, spelled the way the rest of the app already spells it (see
 *  components/admin/email-studio/editor-pane.tsx and the space-canvas editor mount). The server
 *  has no layout to read and React warns if you ask it for one. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

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
// The bar keeps the Vault's old `right-3 w-72` box. The Vault takes the remaining width and
// the chat takes a fixed square at the far end, so "lines up with the left side of the right
// rail" stays true by construction rather than by a magic number.
//
// ⚠️ `w-72` IS THE OPEN RAIL, AND THAT COUPLING IS NOW ENFORCED RATHER THAN ASSUMED. It used to
// be stated here as a plain fact ("the rail is w-72"), and it stopped being one: both rails run
// DAWN's three-position fold ladder (lib/layout/rail-fold.ts), so the right rail folds to a 56px
// strip on ANY route. The bar knew nothing about it and went on spanning 288px, overhanging the
// content column by ~232px. Two things hold the claim up now:
//   • at lg+ the inline `span` overrides the class with the rail's MEASURED box, so the fallback
//     only ever paints where there is no rail to measure (md–lg); and
//   • `folded` hides the bar at lg+ (see below), so the case the class was wrong for cannot be
//     on screen at all.
//
// ── FOLDED: THE BAR HIDES (owner's decision, 2026-08-05) ──────────────────────
//
// Not narrowed to icons — hidden. What survives the fold is real navigation: the rail-foot
// account dock and the top-right system dock are both untouched, so nothing in the app becomes
// unreachable. What is LOST is precise and worth naming rather than papering over: ONE-TAP
// VAULT AND ONE-TAP MESSAGES. The score stops being readable at rest (its other home is the
// mobile drawer, which a desktop member does not have), and the chat trigger goes with it — the
// panel can still be opened by ⌘K, the `open-chat` / `open-vera` events and a `?chat=` link, but
// there is no button in the corner until the rail is unfolded. That is the trade the fold buys:
// a member who folded the rail asked for the column back, and a 288px bar hanging under a 56px
// strip is the opposite of that.
//
// IT HIDES IN CSS, NOT BY UNMOUNTING, and the reason is the md–lg band. The fold is a STANDING
// instruction stored per member; the right rail is `hidden lg:flex`. So a member who folded on
// a desktop arrives on a tablet with `folded` true and NO right rail on screen — and therefore
// no fold control either, because the control lives in the rail. Unmounting would take the Vault
// and Messages away there with no affordance anywhere to bring them back. `lg:hidden` yields to
// the same media query the rail itself yields to, which is rail-fold.ts's own law: the position
// decides the fold, the media query decides whether there is a rail to fold at all.
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
export function DockBar({
  vault,
  folded,
}: {
  vault: React.ReactNode
  /** Is the right rail folded to its strip? The shell's `railCollapsed`, passed down rather than
   *  re-derived: the fold ladder has ONE registry (lib/layout/rail-fold.ts) read in ONE place
   *  (components/layout/app-shell.tsx), and a bar that read the store itself would be a second
   *  answer to a question that already has one. Required, not defaulted — a new call site has to
   *  say what it means. */
  folded: boolean
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const [lift, setLift] = useState(0)
  /** The rail's measured left edge + width. Null until the first measure, which is why the bar
   *  stays invisible rather than painting at a guessed position for a frame. */
  const [span, setSpan] = useState<{ left: number; width: number } | null>(null)
  /** The previous fold, so the dismissal below fires on a TRANSITION and never on a mount that is
   *  already folded. Seeded from the first render for exactly that reason. */
  const wasFolded = useRef(folded)

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
      //
      // This branch is also where a FOLDED rail lands, and it needs no special case: the strip
      // carries no sentinel, so `sentinel` is null and the same zero-tell applies to the bar
      // itself — `lg:hidden` makes its rect all zeros, so `bar` publishes null and the chat panel
      // stops anchoring to a bar that is not on screen. In the md–lg band the bar is still
      // visible while folded and still publishes its real box, which is exactly right there.
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

  // ── The fold's two duties, both of them synchronous ────────────────────────────────────────
  //
  // A LAYOUT effect, not a passive one, and both duties are the reason:
  //
  //   1. WHAT THE BAR'S BOX IS. `folded` only adds a class, so the answer is "ask the browser".
  //      Reading the rect here flushes style once, after the class lands and before paint, which
  //      is what tells the md–lg band (bar still on screen, nothing dismissed) apart from lg+
  //      (bar hidden). A passive effect would answer the same question a frame later, after the
  //      hidden bar had already been painted away.
  //   2. WHERE FOCUS IS. Once the bar is `display:none` the browser blurs whatever was inside it
  //      and `document.activeElement` is <body> — the very drop this exists to prevent, and by
  //      then unreadable. Inside a layout effect the node is still focused, so "was focus in the
  //      bar?" is a plain containment question rather than a flag someone has to keep in sync.
  //
  // The focus hand-off is the same duty `close()` performs in vera-launcher.tsx: move focus only
  // when it is actually inside the thing being taken away, and move it somewhere connected — here
  // the rail's foot control, which is both the affordance that caused this and the way back.
  useIsoLayoutEffect(() => {
    const bar = barRef.current
    const due = dockDismissalDue(wasFolded.current, folded, bar?.getBoundingClientRect().width ?? 0)
    wasFolded.current = folded
    if (!due) return
    const hadFocus = !!bar && bar.contains(document.activeElement)
    // Both segments close through their OWN close(), so the collapse timer, the inbox reset and
    // the chat panel's own focus return each run exactly once. Nothing here reaches into either.
    announceDockDismissed()
    if (hadFocus) {
      document.getElementById(railHandleId('right'))?.querySelector('button')?.focus()
    }
  }, [folded])

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
    //
    // 🔴 THE SENTINEL IS RE-RESOLVED ON EVERY FOLD, which is why `folded` is a dependency of this
    // effect even though the effect never reads it. `RAIL_END_SENTINEL_ID` lives inside the OPEN
    // rail's <aside>; folding replaces that whole subtree with the strip, so the node this
    // observer was watching is detached and can never fire again — and unfolding builds a NEW
    // node the old observer knows nothing about. Without the dependency the ride-up would simply
    // stop working after the first fold/unfold, silently. The `sentinel?.parentElement` guard is
    // load-bearing for the same reason and stays: while folded there is no sentinel at all, and
    // `new ResizeObserver(...).observe(null)` throws rather than doing nothing.
    const sentinel = document.getElementById(RAIL_END_SENTINEL_ID)
    const ro = sentinel?.parentElement ? new ResizeObserver(schedule) : null
    if (ro && sentinel?.parentElement) ro.observe(sentinel.parentElement)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
      // The bar unmounts on /admin and on an editor takeover. A remembered rail would leave the
      // chat panel sized to a column that is no longer on the page. (A FOLD does not come through
      // here — the bar stays mounted and re-measures instead, which is how the md–lg band keeps
      // its bar. The re-measure publishes the null box for lg+ by itself.)
      publishGeometry(NO_GEOMETRY)
    }
  }, [measure, folded])

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
      //
      // `lg:hidden` is the fold, and it is the LAST word by breakpoint order — Tailwind emits the
      // lg block after the md one, so at lg+ it beats `md:flex` and the bar goes. Below lg it says
      // nothing, which is the whole point: that band has no right rail to have folded (see the
      // md–lg note above the component). `display:none` also does the a11y work for free — the
      // segments leave the tab order and the accessibility tree rather than lingering as
      // invisible targets, which `opacity-0` or a translate would not.
      className={`pointer-events-none fixed bottom-0 right-3 z-40 hidden w-72 items-stretch overflow-hidden rounded-tl-card rounded-tr-control border-x border-t border-chrome-border bg-chrome/95 backdrop-blur-sm md:flex print:hidden${
        folded ? ' lg:hidden' : ''
      }`}
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
