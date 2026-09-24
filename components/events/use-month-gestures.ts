'use client'

import { useEffect, useRef, type RefObject } from 'react'

// MONTH GESTURES for the calendar grid (ADR-1385). One month per deliberate gesture, never a run of
// months from a trackpad's momentum. The rules come from the research behind the ADR:
//   · A sideways trackpad swipe or a sideways wheel pages months. It barely competes with page scroll,
//     so it is on by default. A mount can turn it off (`horizontal: false`): the Space page's staff grid
//     pages by its buttons only (owner ruling, PROG-CAL12), and turns every gesture on in the console.
//   · A VERTICAL wheel pages months only when the mount opts in (`vertical`, the staff calendar, where
//     the grid is the work surface). A public calendar sits in a scrolling page, and a wheel that stops
//     scrolling the page reads as a bug. It gives way to anything under the pointer that can still
//     scroll (`verticalScrollTaker`): a busy day's cell owns its own overflow, so reading down it must
//     never page the month away.
//   · A touch swipe pages when it is clearly horizontal (at least 50px, and 1.5x its vertical travel).
//     The grid sets `touch-action: pan-y`, so vertical swipes still scroll the page.
//   · After a step the gesture is LOCKED until the wheel has been quiet for 250ms (max 800ms), which is
//     what swallows momentum. Deltas are normalised from lines and pages to pixels first.

/** True when a vertical move of `delta` belongs to something the reader is scrolling rather than to
 *  the month: an element between `from` and `stopAt` that still has room to scroll that way. A busy
 *  day's cell summarises its overflow inside itself and the console's agenda scrolls on its own, so
 *  a wheel or an arrow aimed at either of those must not page the month out from under it. */
export function verticalScrollTaker(from: EventTarget | null, delta: number, stopAt?: Element | null): boolean {
  let el = from instanceof Element ? from : null
  while (el && el !== stopAt) {
    const overflowY = typeof window !== 'undefined' ? window.getComputedStyle(el).overflowY : 'visible'
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight - el.clientHeight > 1) {
      const room = delta > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : el.scrollTop
      if (room > 1) return true
    }
    el = el.parentElement
  }
  return false
}

const STEP_PX = 60
const QUIET_MS = 250
const MAX_LOCK_MS = 800
const SWIPE_MIN_PX = 50

export function useMonthGestures(
  ref: RefObject<HTMLElement | null>,
  onStep: (delta: 1 | -1) => void,
  opts: {
    vertical?: boolean
    /** The sideways wheel and the touch swipe. Default on; `false` leaves only the buttons and keys. */
    horizontal?: boolean
    /** Re-attach when this changes (the surface re-mounted). */
    remountKey?: unknown
  } = {},
) {
  const stepRef = useRef(onStep)
  useEffect(() => {
    stepRef.current = onStep
  }, [onStep])
  const vertical = !!opts.vertical
  const horizontalOn = opts.horizontal !== false
  const remountKey = opts.remountKey

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!vertical && !horizontalOn) return // buttons only: nothing to listen for
    let acc = 0
    let lockedSince = 0
    let lastEventAt = 0

    // 🔴 WHERE THE WHEEL'S SCROLL-TAKER STOPS LOOKING (LIVE-489, owner report 2026-09-23: "the
    // calendar is still glitching but only when I move the mouse"). The taker walks UP from what the
    // wheel hit until it reaches this boundary, so the boundary decides which scrollers it can see.
    //
    // It used to be the grid itself, which meant only the grid's own DESCENDANTS counted -- a busy
    // day's cell, the agenda. But vertical paging is on in exactly one place, the console, and the
    // console's scroll container (`panels`, overflow-y-auto) is portaled in ABOVE the grid: an
    // ANCESTOR, which the walk reached its boundary before ever seeing. So whenever the console's
    // content overflowed, a wheel meant to scroll it was preventDefault'd and paged the month
    // instead. On a trackpad that is a light flick (STEP_PX is 60), which is what read as the
    // calendar glitching under the pointer.
    //
    // The console's KEY handler never had this bug: it passes the console root and so walks past
    // the scroller correctly. This takes the same boundary, which is all the asymmetry ever was.
    const scrollBoundary = el.closest('[data-calendar-console]') ?? el

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return // pinch-zoom and browser zoom are not month changes
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight || 600 : 1
      const dx = e.deltaX * unit
      const dy = e.deltaY * unit
      const horizontal = Math.abs(dx) > Math.abs(dy)
      if (horizontal ? !horizontalOn : !vertical) return
      const delta = horizontal ? dx : dy
      // A cell that scrolls its own items, or a scrolling agenda under the pointer, keeps its wheel.
      if (!horizontal && verticalScrollTaker(e.target, delta, scrollBoundary)) return
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
    if (horizontalOn) {
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchend', onTouchEnd, { passive: true })
    }
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, vertical, horizontalOn, remountKey])
}
