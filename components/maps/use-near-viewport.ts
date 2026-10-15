'use client'

import { useEffect, useState, type RefObject } from 'react'

// THE MONEY GATE ON A GOOGLE MAP (SCAN-904). Google bills every `new google.maps.Map()` (a "dynamic map
// load"), not the script. Under Frequency a Google map is therefore not built until its box is within
// NEAR_PX of the viewport: a map further down the page that nobody scrolls to never bills, and a pane
// the layout hides (display:none never intersects) never bills at all. The one script loader
// (lib/maps/google-loader.ts) is shared by every map, so this gates the build, not a second loader.
//
// Under DAWN the gate is off and the map builds on mount, exactly as before. A browser without
// IntersectionObserver also builds on mount: a map that never appears would be worse than one load.

/** How close (px) a map may get to the viewport before it is built, so it is ready as it scrolls in. */
const NEAR_PX = 200

function gated(): boolean {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false
  return document.documentElement.dataset.design === 'frequency'
}

/** True once `ref`'s element has come within NEAR_PX of the viewport (or at once, when ungated).
 *  Latches: a map that scrolls back out keeps its one load instead of being rebuilt. */
export function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(() => !gated())
  useEffect(() => {
    const el = ref.current
    if (near || !el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: `${NEAR_PX}px` },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, near])
  return near
}
