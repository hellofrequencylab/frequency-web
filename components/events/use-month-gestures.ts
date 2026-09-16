'use client'

import { useEffect, useRef, type RefObject } from 'react'

// MONTH GESTURES for the calendar grid (ADR-1385). One month per deliberate gesture, never a run of
// months from a trackpad's momentum. The rules come from the research behind the ADR:
//   · A sideways trackpad swipe or a sideways wheel pages months. It barely competes with page scroll,
//     so it is on everywhere.
//   · A VERTICAL wheel pages months only when the mount opts in (`vertical`, the staff calendar, where
//     the grid is the work surface). A public calendar sits in a scrolling page, and a wheel that stops
//     scrolling the page reads as a bug.
//   · A touch swipe pages when it is clearly horizontal (at least 50px, and 1.5x its vertical travel).
//     The grid sets `touch-action: pan-y`, so vertical swipes still scroll the page.
//   · After a step the gesture is LOCKED until the wheel has been quiet for 250ms (max 800ms), which is
//     what swallows momentum. Deltas are normalised from lines and pages to pixels first.

const STEP_PX = 60
const QUIET_MS = 250
const MAX_LOCK_MS = 800
const SWIPE_MIN_PX = 50

export function useMonthGestures(
  ref: RefObject<HTMLElement | null>,
  onStep: (delta: 1 | -1) => void,
  opts: { vertical?: boolean; /** Re-attach when this changes (the surface re-mounted). */ remountKey?: unknown } = {},
) {
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  }, [onStep])
  const vertical = !!opts.vertical
  const remountKey = opts.remountKey

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let acc = 0
    let lockedSince = 0
    let lastEventAt = 0

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // pinch-zoom and browser zoom are not month changes
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight || 600 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const horizontal = Math.abs(dx) > Math.abs(dy)
      if (!horizontal && !vertical) return
      const delta = horizontal ? dx : dy
      e.preventDefault()
      const now = performance.now()
      const quiet = now - lastEventAt > QUIET_MS
      lastEventAt = now
      if (lockedSince) {
        if (quiet || now - lockedSince > MAX_LOCK_MS) {
          lockedSince = 0
          acc = 0
        } else {
          return // momentum from the gesture that already moved a month
        }
      }
      if (quiet) acc = 0
      acc += delta
      if (Math.abs(acc) >= STEP_PX) {
        stepRef.current(acc > 0 ? 1 : -1)
        acc = 0
        lockedSince = now
      }
    }

    let startX = 0
    let startY = 0
    let tracking = false
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      tracking = true
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) stepRef.current(dx < 0 ? 1 : -1)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, vertical, remountKey])
}
