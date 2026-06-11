'use client'

import { useEffect, useRef } from 'react'

// Sticky wrapper for the admin LEFT menu (owner spec): the menu scrolls WITH the
// page — no inner scrollbar — and when the page keeps scrolling, it pins so its
// BOTTOM rides at the viewport's 1/2 mark.
//
// CSS alone can't pin an unknown-height element's bottom at 50vh (sticky `top`
// needs the height), so this measures the content (ResizeObserver + window
// resize) and sets `top: min(topOffset, 50vh - height)`:
//   • menu taller than half the viewport → negative top → it scrolls up past the
//     header until its bottom reaches the midpoint, then sticks there;
//   • short menu → plain top offset → pins under the bar exactly as before.
// Writes el.style directly (no state, no re-renders); SSR default is the plain
// top offset so there's no layout jump before hydration.
export function StickyHalf({
  topOffsetRem = 6.5,
  className = '',
  children,
}: {
  /** The under-the-sticky-bar offset (rem) short menus pin at. */
  topOffsetRem?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const offset = topOffsetRem * rem
      const half = window.innerHeight / 2
      el.style.top = `${Math.min(offset, half - el.offsetHeight)}px`
    }

    const ro = new ResizeObserver(apply) // fires once on observe, then on size changes
    ro.observe(el)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [topOffsetRem])

  return (
    <div ref={ref} className={`sticky ${className}`} style={{ top: `${topOffsetRem}rem` }}>
      {children}
    </div>
  )
}
