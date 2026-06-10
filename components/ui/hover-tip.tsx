import type { ReactNode } from 'react'

// A fast, styled mouseover tooltip — replaces the browser-native `title=` (which is
// slow, ~1s, and unstyleable). Appears in ~100ms with a solid dark bubble and a small
// rise, so it reads quickly and clearly. CSS-only (group-hover), no JS. Use on header
// icon controls (Friends, Messages, Streak, Notifications). Hidden for touch (no hover).
export function HoverTip({
  label,
  children,
  side = 'bottom',
  className,
}: {
  label: string
  children: ReactNode
  /** Which side the bubble sits on. Default below (header icons). */
  side?: 'bottom' | 'top'
  className?: string
}) {
  const pos =
    side === 'top'
      ? 'bottom-full mb-1.5 group-hover/tt:-translate-y-0 translate-y-1'
      : 'top-full mt-1.5 group-hover/tt:translate-y-0 -translate-y-1'
  return (
    <span className={`group/tt relative inline-flex ${className ?? ''}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-2xs font-semibold text-on-primary opacity-0 shadow-lg transition-[opacity,transform] duration-100 ease-out group-hover/tt:opacity-100 ${pos}`}
      >
        {label}
      </span>
    </span>
  )
}
