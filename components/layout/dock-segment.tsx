'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  DOCK_HEAD_H_CLASS,
  DOCK_SCROLL_DISMISS_PX,
  announceDockSegmentOpen,
  onOtherDockSegmentOpen,
  setDockPanelOpen,
} from '@/components/layout/dock-bar'

// ── ONE SEGMENT SHELL FOR THE BOTTOM-LEFT DOCK TAB ───────────────────────────────────────────
//
// The bar (components/layout/dock-bar.tsx) takes its left segment as a ReactNode, so BOTH the
// member Vault and the operator page-admin dock render into the same slot. They did not behave
// the same way in it, and the difference was not cosmetic (owner, 2026-08-06: "the admin page
// pop up menu should behave exactly the same as the vault"):
//
//   • The Vault dismisses on Esc and on an outside click. The admin dock dismissed on neither,
//     so the only way to close it was to hit the same tab again.
//   • The Vault joins the bar's one-panel-at-a-time channel, so opening it slides the chat panel
//     shut and folding the rail closes it. The admin dock joined nothing, so an operator could
//     have it open UNDERNEATH an open chat panel — the exact two-stacked-panels state the
//     channel exists to prevent, still reachable on every /admin route.
//   • The Vault reveals on the motion tokens, which the reduced-motion block in globals.css
//     zeroes. The admin dock hardcoded `duration-300`, so it animated regardless of the member's
//     stated preference.
//   • The Vault's head is DOCK_HEAD_H_CLASS, the shared crest height. The admin dock hand-rolled
//     `py-3`, so the two segments of one split tab were different heights.
//
// This owns all four. A segment supplies only its HEAD and its CONTENTS.
//
// 🔴 FOLLOW-UP, deliberately not done here: components/sidebar/game-stats-dock.tsx still carries
// its own copy of this logic. It is the shell this file was extracted FROM, it is green, and it
// is pinned by guards in components/layout/dock-bar.test.ts that assert the head class appears in
// that file. Migrating it is a guard edit plus a re-verify, and doing it in the same pass as the
// admin fix would mean shipping a change to the working Vault to fix the broken one. Until then
// the two agree because BOTH read DOCK_HEAD_H_CLASS and the same channel helpers from dock-bar —
// the values that could drift are imported, not restated.

export function DockSegment({
  regionLabel,
  head,
  children,
}: {
  /** Names the revealed panel for assistive tech, the way "The Vault" names the Vault's. */
  regionLabel: string
  /** The tab head's CONTENTS. The shell owns the button, its height, its hit area and its
   *  `aria-expanded`, so a segment cannot accidentally ship a different crest. */
  head: (state: { open: boolean }) => React.ReactNode
  /** The panel's contents. */
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Esc, an outside click, or ANY other segment announcing itself. The third is what the admin
  // dock never had: the chat tab portals into the bar's other segment, so clicking it is already
  // an outside click on this root — but every other way the chat opens (the `open-chat` event, a
  // `?chat=…` deep link, the admin "Ask Vera" bar) reaches it without a click, and only the
  // channel sees those. The listener exists only WHILE OPEN, so being told to close while closed
  // is not a case that can arise.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // SCROLL DISMISSAL, with a deadband (owner, 2026-08-06). The panel is pinned to the corner
    // while the page moves underneath it, so it is stale the moment the reader scrolls away from
    // where they opened it. The threshold is what keeps trackpad inertia and a collapsing mobile
    // address bar from reading as the panel shutting itself for no reason.
    const openedAt = window.scrollY
    function onScroll() {
      if (Math.abs(window.scrollY - openedAt) > DOCK_SCROLL_DISMISS_PX) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    // Also covers a case that is not another panel: folding the rail takes the whole bar off
    // screen and DockBar announces that on this same channel.
    const offOther = onOtherDockSegmentOpen('vault', () => setOpen(false))
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      offOther()
    }
  }, [open])

  // A link inside the panel routes away and the panel stayed open over the new page, still
  // showing the previous page's admin. Closing on the path change covers every exit — the links
  // here, a deep link from inside, the browser's own back button — where an onClick on each row
  // would only cover the ones someone remembered to wire.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOpen(false)
  }, [pathname])

  // The standing FACT, not the edge. The announcement channel only ever says "I just opened", so
  // a neighbour listening to it alone would latch on the first open and never learn this went
  // away again. Reported from an effect rather than from the toggle so every path that changes
  // `open` arrives here, and the cleanup covers unmount, which no call site can.
  useEffect(() => {
    setDockPanelOpen('vault', open)
    return () => setDockPanelOpen('vault', false)
  }, [open])

  /** THE ONE WAY IN. The announcement is what slides the chat panel shut, so an open path that
   *  forgets to announce is an open path that leaves two panels stacked in one column.
   *
   *  The announcement is deliberately OUTSIDE the state updater. A `setOpen(was => { announce();
   *  return !was })` reads as tidier and is wrong twice over: a React updater must be PURE, and
   *  `announceDockSegmentOpen` dispatches a DOM event synchronously — so under StrictMode's
   *  double-invocation the bar hears the same open announced twice, and any listener that is not
   *  idempotent acts on it twice. This mirrors the Vault's own `openVault()`, which sets first
   *  and announces after, for the same reason. */
  function toggle() {
    const next = !open
    setOpen(next)
    if (next) announceDockSegmentOpen('vault')
  }

  return (
    <div
      ref={rootRef}
      // NO crest, NO border, NO blur: the bar draws all three around both segments. A segment
      // that draws its own nests a second rounded surface inside the first, which is what made
      // the Vault read as a pill sitting in a tray before it was flattened.
      className="w-full px-2 pt-1"
    >
      {/* Reveals INSIDE the tab (0fr -> 1fr) rather than as a sibling above it, so the bar's
          bottom edge stays pinned to the corner and nothing lifts off it. Motion TOKENS, not a
          literal duration: globals.css zeroes the --motion-* vars for reduced motion rather than
          disabling transitions, so a hardcoded duration opts the member's preference out. */}
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0">
          <div
            role="region"
            aria-label={regionLabel}
            className="max-h-[70dvh] overflow-y-auto px-2 pb-2 pt-2"
          >
            {children}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex ${DOCK_HEAD_H_CLASS} w-full items-center gap-2 rounded-lg px-1.5 transition-colors hover:bg-surface-elevated`}
      >
        {head({ open })}
      </button>
    </div>
  )
}
