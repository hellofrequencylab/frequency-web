'use client'

import { useEffect, useState } from 'react'

// True below the given breakpoint (default 768px = Tailwind `md`). SSR-safe: it
// starts `false` on the server and first client render, then reconciles on mount
// (avoids a hydration mismatch), and stays live via a matchMedia listener so the
// editor swaps chrome if the viewport crosses the breakpoint (rotation, resize).
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpointPx])

  return isMobile
}
