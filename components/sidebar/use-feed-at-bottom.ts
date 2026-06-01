'use client'

import { useEffect, useState } from 'react'

// Drives the bottom docks' reveal. True after the user makes a continued
// DOWNWARD scroll gesture while already at the bottom of the feed area, and
// false as soon as they scroll back up. Gesture-driven (not position-driven) so:
//  - it never pops open on load (no gesture yet),
//  - it works on short pages too (a continued scroll past the end reveals it),
//  - it can't oscillate when expanding changes the layout height (a layout
//    shift fires no wheel event, and we only collapse on a clear upward move).
//
// The feed scroll container is tagged with `data-feed-scroll` in AppShell.
export function useFeedAtBottom(threshold = 140): boolean {
  const [atBottom, setAtBottom] = useState(false)

  useEffect(() => {
    const el = document.querySelector('[data-feed-scroll]') as HTMLElement | null
    if (!el) return

    const remaining = () => el.scrollHeight - el.scrollTop - el.clientHeight

    // Trackpad / mouse wheel: the primary trigger. A downward push while at the
    // bottom reveals; any upward push collapses.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) {
        if (remaining() <= threshold) setAtBottom(true)
      } else if (e.deltaY < 0) {
        setAtBottom(false)
      }
    }

    // On long pages, also collapse once the user scrolls well clear of the
    // bottom (hysteresis keeps a small layout jitter from flipping it).
    const onScroll = () => {
      if (remaining() > threshold * 2.5) setAtBottom(false)
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', onScroll)
    }
  }, [threshold])

  return atBottom
}
