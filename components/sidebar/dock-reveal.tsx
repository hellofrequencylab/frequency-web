'use client'

import { createContext, useContext, useEffect, useState, type RefObject } from 'react'

// ── Bottom-dock reveal: one shared, intent-driven controller ──────────────────
//
// Both bottom docks (left profile card, right stats dock) "rise" together when
// the feed scroll reaches its end. Previously each dock ran its own scroll
// listener, so they drifted out of sync and the position-based trigger could
// oscillate: revealing a dock grows the scroll height, which moves you away
// from the bottom, which collapses it, which shrinks the height… a flicker.
//
// The fix is to drive the reveal from scroll *intent*, not scroll *position*:
//   • a continued DOWNWARD gesture while near the end reveals,
//   • only a clear UPWARD gesture (or scrolling well clear) collapses.
// A layout shift from a dock expanding keeps scrollTop steady (no delta) and
// fires no wheel event, so it can never feed back and re-trigger the reveal.
//
// Inputs covered: mouse wheel + trackpad (`wheel`, also the only signal once
// you're pinned at the very bottom and scrollTop can't move further) and
// touch / keyboard / scrollbar / momentum (`scroll`, read as a scrollTop delta).

const REVEAL_NEAR = 140 // px from the end that counts as "near the bottom"
const FORCE_CLEAR = 600 // scrolled this far clear of the end → force-collapse

const DockRevealContext = createContext(false)

export function DockRevealProvider({ children }: { children: React.ReactNode }) {
  const [atBottom, setAtBottom] = useState(false)

  useEffect(() => {
    // The document is the scroll container (the shell scrolls the page, not an inner
    // pane), so we read the document scroller and listen on window.
    const doc = () => document.scrollingElement ?? document.documentElement

    let lastTop = doc().scrollTop
    const remaining = () => {
      const el = doc()
      return el.scrollHeight - el.scrollTop - el.clientHeight
    }

    const reveal = () => {
      if (remaining() <= REVEAL_NEAR) setAtBottom(true)
    }

    // Wheel/trackpad — fires even when scrollTop is already pinned at the end.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 1) reveal()
      else if (e.deltaY < -1) setAtBottom(false)
    }

    // Scroll — direction from the scrollTop delta covers touch, keyboard,
    // scrollbar drag and momentum. An expand-driven layout shift leaves
    // scrollTop unchanged (delta ≈ 0), so it never re-triggers.
    const onScroll = () => {
      const top = doc().scrollTop
      const dy = top - lastTop
      lastTop = top
      if (dy > 0.5) reveal()
      else if (dy < -0.5) setAtBottom(false)
      if (remaining() > FORCE_CLEAR) setAtBottom(false)
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return <DockRevealContext.Provider value={atBottom}>{children}</DockRevealContext.Provider>
}

/** True when the feed scroll has reached its end (both docks rise together). */
export function useDockRevealed(): boolean {
  return useContext(DockRevealContext)
}

// ── Hover-to-reveal ───────────────────────────────────────────────────────────
// Independent of scroll position: when the pointer is over a dock (or its
// always-visible compact bar) and the user scrolls, that dock rises on its own,
// and settles back once the pointer leaves. Pass the dock root's ref; OR the
// returned boolean with the shared reveal + manual toggle.
export function useHoverScrollReveal(ref: RefObject<HTMLElement | null>): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let hovered = false
    const enter = () => {
      hovered = true
    }
    const leave = () => {
      hovered = false
      setOpen(false)
    }
    const onWheel = (e: WheelEvent) => {
      if (!hovered) return
      if (e.deltaY > 1) setOpen(true)
      else if (e.deltaY < -1) setOpen(false)
    }

    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('mouseenter', enter)
      el.removeEventListener('mouseleave', leave)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])

  return open
}
