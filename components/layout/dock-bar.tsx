'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { RailFoldTick } from '@/components/layout/rail-fold-control'
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
 * `h-12` (51px at this app's 17px root). The ladder here has moved twice and both moves were the
 * same mistake in opposite directions, so the reasoning is worth keeping: `h-10` was too short for
 * the left tab and `h-11` was chosen as "the smallest step that still fits" its two lines beside a
 * 38px avatar. Smallest-that-fits is the wrong target for a crest — it fits by leaving no room, and
 * the owner read the result as a tab that looked cut off (2026-08-06: "bottom left tab is too
 * short"). 38px of avatar in 46.75px of head is ~4px of air top and bottom.
 *
 * 51px gives ~6.5px, which is the first step where the avatar and the name/badge stack both sit in
 * the head rather than against its edges. The right tab's counters only gain room, and the two
 * stay equal because this is still the one class both sides import.
 */
export const DOCK_HEAD_H_CLASS = 'h-12'

/**
 * How far the page must actually scroll before an open dock panel collapses (owner, 2026-08-06:
 * "the bottom right menu needs to collapse on scroll down").
 *
 * A dock panel is anchored to a corner while the page moves underneath it, so it goes stale the
 * moment the reader leaves the position they opened it from. The DEADBAND is why this is a
 * threshold and not a plain scroll listener: trackpad inertia and a mobile address bar collapsing
 * both fire scroll events the reader did not ask for, and dismissing on those reads as the panel
 * closing itself at random. 24px is past both and under any deliberate flick.
 */
export const DOCK_SCROLL_DISMISS_PX = 24

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
 * Announce that the bar's PANELS are leaving the screen, so both segments close.
 *
 * The one caller is DockBar, when a fold takes the Vault segment away (see `dockDismissalDue`).
 * It rides the open channel because every listener already treats "not me" as "close", so the
 * Vault and the chat panel each run the SAME `close()` the Esc key and the outside click run —
 * focus return, the collapse timer and the inbox reset happen once, through one path, rather than
 * being re-implemented for the fold.
 *
 * 🔴 IT STILL CLOSES BOTH, even though the chat TAB now survives the fold (owner, 2026-08-05).
 * The tab surviving and the panel surviving are different claims. An open panel is sized and
 * placed against a column that the fold has just deleted — the Vault's segment is gone outright,
 * and the chat panel was hanging off a bar that has shrunk from the rail's width to a corner
 * square. Closing both keeps ONE dismissal path (the thing this channel exists to guarantee) and
 * costs the member nothing they cannot get back in one press: the chat tab is right there.
 */
export function announceDockDismissed(): void {
  announce('dismissed')
}

// ── WHO OWNS THE OPEN PANEL, as readable state ────────────────────────────────
//
// The channel above is an EVENT: it is how a segment tells the other one to stand down, and it is
// deliberately fire-and-forget. What it cannot answer is the standing question "is the Vault open
// right now", and that question now has a consumer:
//
//   OWNER, 2026-08-05, off a screenshot of the open Vault: "when the Vault is open, the message
//   tab stays closed" — i.e. the chat tab must not be sitting beside an open Vault panel wearing
//   its full-amber active fill.
//
// The tab could not answer that from the event channel alone: it hears "the Vault opened" but
// never "the Vault closed", so it would latch. So each segment publishes its own open/closed here
// and the other reads it. A module store rather than a context, for the same reason the geometry
// store is one: DockBar, the Vault segment and the chat launcher have three different parents.

let panelOwner: DockSegment | null = null
const panelListeners = new Set<() => void>()

/** Report this segment's panel state. Idempotent, and a segment can only ever clear ITS OWN
 *  ownership — `setDockPanelOpen('chat', false)` must not erase an open Vault, which is exactly
 *  what a naive `open ? segment : null` would do on the chat panel's unmount. */
export function setDockPanelOpen(segment: DockSegment, open: boolean): void {
  const next = open ? segment : panelOwner === segment ? null : panelOwner
  if (next === panelOwner) return
  panelOwner = next
  for (const listener of panelListeners) listener()
}

export function subscribeDockPanel(onChange: () => void): () => void {
  panelListeners.add(onChange)
  return () => {
    panelListeners.delete(onChange)
  }
}

/** Which segment's panel is open, or null. Stable by identity (it is a string or null), which is
 *  what `useSyncExternalStore` needs. */
export function getDockPanelOwner(): DockSegment | null {
  return panelOwner
}

/** The server has no open panel, ever. */
export function getServerDockPanelOwner(): DockSegment | null {
  return null
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
 *   • `vaultWidth` is the one that keeps a tablet member from being trapped. The fold takes the
 *     VAULT segment at lg and up, where the rail it belongs to actually exists. In the md–lg band
 *     there is NO right rail (`hidden lg:flex`) and therefore no fold tick on screen either — so a
 *     standing 'strip' instruction set on a desktop must NOT take the Vault away there, or the
 *     member loses it with no affordance anywhere to bring it back. It stays put in that band, so
 *     nothing was dismissed and nothing should be announced. Zero width is the tell, the same tell
 *     `measure()` uses below: a `display:none` box reports all zeros.
 *
 * 🔴 IT IS THE VAULT SEGMENT'S WIDTH, NOT THE BAR'S, and that is the ADR-946 amendment in one
 * argument. The bar used to go with the fold entirely (`lg:hidden`), so "the bar has no width" and
 * "the Vault went away" were the same fact and either could be measured. The owner has since asked
 * for the chat tab to SURVIVE the fold, so the bar is never zero-width at lg+ any more and reading
 * it would report `false` on every fold — no dismissal, and an open Vault panel left hanging over
 * a column that no longer exists. The subject of the sentence has to be the thing that actually
 * left.
 */
export function dockDismissalDue(wasFolded: boolean, folded: boolean, vaultWidth: number): boolean {
  return folded && !wasFolded && vaultWidth === 0
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
 *
 * 🔴 WHAT IT DOES WHILE THE RAIL IS FOLDED: nothing, and by construction rather than by a guard.
 * The Vault segment is not on screen at lg+ while folded, so an auto-open would be an open nobody
 * can see. `atRailEnd` is derived from `RAIL_END_SENTINEL_ID`, which lives inside the OPEN rail's
 * <aside> — a folded rail has no sentinel, so `measure()` takes its no-rail branch and publishes
 * `atRailEnd: false` on every frame. The trigger cannot fire because the fact it reads is never
 * true, which is a better answer than an `if (folded) return` somebody has to keep in sync: there
 * is no "end of the rail" to reach when the rail is a strip of three icons.
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

/**
 * How far the bar rises off the window's bottom edge to meet the end of the rail.
 *
 * 🔴 A SHORT RAIL GETS NO RIDE-UP, and that is the whole fix (owner, 2026-08-06: "the Page Admin
 * tab keeps popping up like this", with the tab floating in the middle of the page over the
 * roster). The lift used to be `window.innerHeight - railEndBottom` unconditionally. Read that
 * against a rail SHORTER than the window — say a 620px rail in a 900px viewport, which is every
 * /admin page with a light info rail — and it evaluates to ~280px of lift. The bar dutifully
 * climbed 280px and came to rest in open canvas, a third of the way up the screen, on top of
 * whatever was there.
 *
 * The irony is that this is the exact failure the ride-up was written to prevent. Its own note
 * says fixed-to-the-bottom is "wrong once you reach the rail's end -- the bar then floats in empty
 * space, detached from the content it belongs to". That reasoning holds only for a rail you can
 * SCROLL: reaching the end of a long rail means the cards above the bar stopped, and following
 * them up keeps the bar attached. A rail that never scrolls has no "end you reach" — it simply
 * stops high on the page, and the gap under it is the page, not a trail of vacated rail. Riding
 * up into that gap is how a docked corner tab becomes a floating one.
 *
 * So the ride-up is gated on the rail actually overflowing the viewport, which is the SAME test
 * `atRailEnd` was already making separately. One rule in one place now: if this returns zero the
 * bar is pinned to the corner, and `atRailEnd` is false because there is no end to have reached.
 *
 * `Math.max(0, …)` still guards the other direction — a rail whose end is BELOW the window bottom
 * (you have not scrolled down to it yet) would otherwise produce a negative lift and push the bar
 * off the bottom of the screen.
 */
export function dockLift(railHeight: number, railEndBottom: number, viewportHeight: number): number {
  if (railHeight <= viewportHeight) return 0
  return Math.max(0, Math.round(viewportHeight - railEndBottom))
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
// ── FOLDED: THE VAULT GOES, THE CHAT TAB STAYS (owner, 2026-08-05 — AMENDS ADR-946) ───────────
//
// ADR-946 recorded the whole bar hiding at strip width, on the reasoning that a member who folded
// the rail asked for the page rather than more chrome. The owner has now seen that live and
// amended it: the CHAT TAB specifically survives the fold. So the bar's two segments no longer
// share a fate.
//
//   Vault segment  `lg:hidden` while folded. It is a 288px-wide score readout; there is no 288px
//                  column under it any more, and it is the half that was actually overhanging.
//   Chat segment   stays. Messages is a conversation somebody else may be waiting on, which is
//                  not the same kind of thing as a score you can look at later.
//   The BAR        stops spanning the rail and shrinks to its content (`lg:w-auto`), so what is
//                  left is a ~48px corner tab at `right-3` rather than a 288px bar overhanging
//                  the content column by ~232px. That overhang is the defect ADR-946 was fixing,
//                  and it is fixed here by SIZING rather than by hiding.
//
// What is still LOST, stated rather than papered over: one-tap VAULT. The score stops being
// readable at rest (its other home is the mobile drawer, which a desktop member does not have)
// until the rail is unfolded — one press of the fold tick, which now rides on this very tab.
//
// THE MD–LG REASONING IS UNCHANGED AND STILL LOAD-BEARING. The fold is a STANDING instruction
// stored per member; the right rail is `hidden lg:flex`. So a member who folded on a desktop
// arrives on a tablet with `folded` true and NO right rail on screen — and therefore no fold tick
// on screen either. Everything the fold takes is taken with an `lg:` variant, so that band keeps
// its whole bar and nothing becomes unreachable where the affordance to undo it does not exist.
// That is rail-fold.ts's own law: the position decides the fold, the media query decides whether
// there is a rail to fold at all.
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
  onFold,
}: {
  vault: React.ReactNode
  /** Is the right rail folded to its strip? The shell's `railCollapsed`, passed down rather than
   *  re-derived: the fold ladder has ONE registry (lib/layout/rail-fold.ts) read in ONE place
   *  (components/layout/app-shell.tsx), and a bar that read the store itself would be a second
   *  answer to a question that already has one. Required, not defaulted — a new call site has to
   *  say what it means. */
  folded: boolean
  /** Fold/unfold the right rail. Optional because not every bar belongs to a rail on the ladder:
   *  the operator info rail (app/(main)/admin/layout.tsx) mounts this same bar and cannot be
   *  folded at all, so it passes nothing and no tick renders. Omission is the honest way to say
   *  "there is no fold here" — a no-op handler would draw a control that does nothing. */
  onFold?: () => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  /** The Vault segment's own box. It, not the bar's, is what the fold takes at lg+ now that the
   *  chat tab survives — see `dockDismissalDue`. */
  const vaultRef = useRef<HTMLDivElement>(null)
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

    // How far the rail's end sits ABOVE the bar's resting line (the window's bottom edge), on a
    // rail long enough for that to mean anything — see `dockLift`. On a long page the bar stays
    // pinned to the window while the rail is taller than the viewport, then rises to meet the
    // rail's end as you reach it, and returns as you scroll back. Scroll-linked on purpose (no
    // transition), so it tracks rather than chases. A rail shorter than the window gets zero and
    // the bar stays in the corner.
    const railBottom = sentinel.getBoundingClientRect().bottom
    const lift = dockLift(rect.height, railBottom, window.innerHeight)
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
      // shorter than the window is at its end from the first paint, and nobody scrolled — which
      // `dockLift` now encodes, so this reads the lift rather than re-testing the height. The two
      // used to state the overflow rule separately and were free to disagree; they cannot now.
      atRailEnd: lift > 0,
    })
  }, [])

  // ── The fold's two duties, both of them synchronous ────────────────────────────────────────
  //
  // A LAYOUT effect, not a passive one, and both duties are the reason:
  //
  //   1. WHAT THE VAULT SEGMENT'S BOX IS. `folded` only adds a class, so the answer is "ask the
  //      browser". Reading the rect here flushes style once, after the class lands and before
  //      paint, which is what tells the md–lg band (Vault still on screen, nothing dismissed)
  //      apart from lg+ (Vault hidden). A passive effect would answer the same question a frame
  //      later, after the hidden segment had already been painted away.
  //   2. WHERE FOCUS IS. Once the segment is `display:none` the browser blurs whatever was inside
  //      it and `document.activeElement` is <body> — the very drop this exists to prevent, and by
  //      then unreadable. Inside a layout effect the node is still focused, so "was focus in the
  //      Vault?" is a plain containment question rather than a flag someone has to keep in sync.
  //
  // The focus hand-off is the same duty `close()` performs in vera-launcher.tsx: move focus only
  // when it is actually inside the thing being taken away, and move it somewhere connected — here
  // the fold tick on this bar's own corner, which is both the affordance that caused this and the
  // way back.
  useIsoLayoutEffect(() => {
    const vaultBox = vaultRef.current
    const due = dockDismissalDue(
      wasFolded.current,
      folded,
      vaultBox?.getBoundingClientRect().width ?? 0,
    )
    wasFolded.current = folded
    if (!due) return
    // Focus only has to move if it was inside the part that is LEAVING. The chat tab survives the
    // fold, so a member focused on it keeps their place and no hand-off is owed.
    const hadFocus = !!vaultBox && vaultBox.contains(document.activeElement)
    // Both segments close through their OWN close(), so the collapse timer, the inbox reset and
    // the chat panel's own focus return each run exactly once. Nothing here reaches into either.
    announceDockDismissed()
    if (hadFocus) {
      document.getElementById(railHandleId('right'))?.focus()
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
      // 🔴 `overflow-hidden` MOVED OFF THIS ELEMENT onto the segment row below, and it is not a
      // tidy-up. It clips the two segments to the crest (which is what keeps the chat button's
      // own square corner from poking out past the rounded top) — but it clipped EVERY descendant,
      // including the fold tick, which is deliberately centred ON this bar's top-left corner and
      // would have been sliced in half and made unclickable. The clip now belongs to the row that
      // needs clipping; the tick is a sibling of that row, so it keeps both halves.
      //
      // `lg:w-auto` is the fold. It is the LAST word by breakpoint order — Tailwind emits the lg
      // block after the md one — and it REPLACES the `lg:hidden` ADR-946 shipped: the whole bar
      // used to go, and the owner has since asked for the chat tab to survive (see the block above
      // the component). Shrinking to content is what stops the ~232px overhang the hide was for,
      // while leaving a real tab in the corner. Below lg it says nothing, which is the whole
      // point: that band has no right rail to have folded.
      className={`pointer-events-none fixed bottom-0 right-3 z-40 hidden w-72 items-stretch rounded-tl-card rounded-tr-control border-x border-t border-chrome-border bg-chrome/95 backdrop-blur-sm md:flex print:hidden${
        folded ? ' lg:w-auto' : ''
      }`}
    >
      {/* The rail's fold TICK, on this tab's top-left corner — the corner nearest the seam it
          moves. It is a CHILD of the bar rather than a sibling parked near it, which is the whole
          reason the foot control's old failure mode (a `sticky` offset that does not stack against
          a `fixed` bar, so the control painted underneath it) cannot recur: it rides the bar's own
          box, including the ride-up and the Vault panel's unfurl.
          `hidden lg:flex` because the RIGHT RAIL only exists at lg+, while this bar renders from
          md — a fold tick in the md–lg band would offer to fold a rail that is not there.
          Rendered only when a fold is actually possible; /admin's info rail passes no handler. */}
      {onFold && (
        <RailFoldTick
          side="right"
          showing={folded ? 'strip' : 'open'}
          onPress={onFold}
          className="hidden lg:flex"
        />
      )}

      {/* The segment row. It carries the clip (see above) and therefore has to restate the crest
          radii: its box is inset by the bar's 1px border, so the two curves differ by a pixel that
          no one can see, and the alternative — clipping on the bar itself — costs the tick. */}
      <div className="flex flex-1 items-stretch overflow-hidden rounded-tl-card rounded-tr-control">
        {/* The Vault segment. min-w-0 so its head can shrink rather than push the chat off.
            `relative` is load-bearing: the fold tick is absolutely positioned over this corner, and
            a positioned sibling LATER in the tree paints (and hit-tests) above it — so the Vault's
            own head keeps every one of its own pixels and the tick can never steal its press.
            `lg:hidden` while folded is the amended ADR-946: the score goes with the rail, the chat
            tab beside it stays. */}
        <div
          ref={vaultRef}
          className={`pointer-events-auto relative min-w-0 flex-1${folded ? ' lg:hidden' : ''}`}
        >
          {vault}
        </div>

        {/* The chat segment, divided from the Vault by the rail's own hairline. Same bar, same
            bottom edge, same crest — one anchored system, two jobs. The launcher portals its
            button in here and owns its own tone (muted at rest, full amber on an unread).
            `relative` for the same reason the Vault's wrapper has it. The left hairline is dropped
            while folded: with the Vault gone there is nothing on the other side of it to divide
            from, and a rule down the left edge of a lone tab reads as a seam to nowhere. */}
        <div
          id={DOCK_CHAT_SLOT_ID}
          className={`pointer-events-auto relative shrink-0 border-l border-chrome-border${
            folded ? ' lg:border-l-0' : ''
          }`}
        />
      </div>
    </div>
  )
}
