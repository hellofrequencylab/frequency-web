'use client'

import { useState, type ReactNode } from 'react'

// The two floating edge buttons — Vera (right) and Next Steps (left) — share THIS one
// component so they're identical in size + behaviour on web and mobile:
//   • collapsed (tucked to its edge) by default;
//   • WEB: mouse-over reveals it; a click then opens its panel;
//   • MOBILE: first tap reveals it; a second tap opens its panel;
//   • when something's waiting, a faint coloured outer glow pulses behind it
//     (orange for Vera, blue for Next Steps).
export function EdgePill({
  side,
  label,
  icon,
  waiting = false,
  glow,
  onOpen,
  ariaLabel,
}: {
  side: 'left' | 'right'
  label: string
  icon: ReactNode
  /** Pulse the glow + (mobile) act as the "message waiting" indicator. */
  waiting?: boolean
  glow: 'blue' | 'orange'
  onOpen: () => void
  ariaLabel: string
}) {
  const [expanded, setExpanded] = useState(false)
  const onLeft = side === 'left'

  // Reveal-then-open: while collapsed a click reveals; once revealed a click opens.
  // On web, mouse-over reveals first, so a single click opens; on touch there's no
  // hover, so it's two taps.
  function handleClick() {
    if (expanded) {
      setExpanded(false)
      onOpen()
    } else {
      setExpanded(true)
    }
  }

  const peek = expanded
    ? 'translate-x-0'
    : onLeft
      ? '-translate-x-[calc(100%-2.1rem)]'
      : 'translate-x-[calc(100%-2.1rem)]'

  const skin = onLeft
    ? 'left-0 rounded-r-full border border-l-0 border-border bg-surface/90 text-broadcast-strong backdrop-blur-sm'
    : 'right-0 rounded-l-full bg-primary/90 text-on-primary'

  const glowColor = glow === 'orange' ? 'bg-primary/50' : 'bg-broadcast/50'
  const glowRound = onLeft ? 'rounded-r-full' : 'rounded-l-full'

  return (
    <button
      type="button"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      className={`fixed bottom-20 z-40 flex items-center gap-1.5 py-2 text-sm font-semibold shadow-sm transition-transform duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] md:bottom-6 ${
        onLeft ? 'flex-row-reverse pl-4 pr-3.5' : 'pl-3.5 pr-4'
      } ${skin} ${peek}`}
    >
      {/* Outer glow glimmer — only when a message is waiting. */}
      {waiting && (
        <span
          aria-hidden
          className={`pointer-events-none absolute -inset-1.5 ${glowRound} ${glowColor} blur-md motion-safe:animate-pulse`}
        />
      )}
      <span className="relative shrink-0">{icon}</span>
      <span className="relative whitespace-nowrap">{label}</span>
    </button>
  )
}
