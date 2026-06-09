'use client'

import { useEffect, useState, type ReactNode } from 'react'

// The two floating edge buttons — Vera (right) and Next Steps (left) — share THIS one
// component so they're identical in size + behaviour on web and mobile:
//   • collapsed (tucked to its edge) by default, but ALWAYS showing its icon + a sliver
//     of the pill so it stays recognisable at rest;
//   • WEB: mouse-over reveals it; a click then opens its panel;
//   • MOBILE: first tap reveals it; a second tap opens its panel;
//   • when something's waiting, the pill does an OCCASIONAL WIGGLE (a brief shake every
//     ~8–12s) instead of a constant glow — a quiet "psst", honoured for reduced motion.
export function EdgePill({
  side,
  label,
  icon,
  waiting = false,
  glow,
  glowMobile = true,
  onOpen,
  ariaLabel,
}: {
  side: 'left' | 'right'
  label: string
  icon: ReactNode
  /** Periodically wiggle the pill as the "something's waiting" indicator. */
  waiting?: boolean
  /** Retained for caller compatibility (no longer renders a glow). */
  glow: 'blue' | 'orange'
  /** Retained for caller compatibility (no longer renders a glow). */
  glowMobile?: boolean
  onOpen: () => void
  ariaLabel: string
}) {
  // `glow` / `glowMobile` are intentionally unused now (the glow was replaced by the
  // wiggle), but kept in the signature so existing call sites keep compiling.
  void glow
  void glowMobile

  const [expanded, setExpanded] = useState(false)
  // The wiggle is acknowledged once the tab is clicked, and only returns on a page
  // refresh (this state resets on mount).
  const [dismissed, setDismissed] = useState(false)
  const [wiggling, setWiggling] = useState(false)
  const onLeft = side === 'left'

  // Occasional wiggle: while waiting (and not yet acknowledged), fire a brief shake on
  // an interval (~8–12s, jittered) rather than a continuous animation. Respect
  // prefers-reduced-motion — no wiggle at all when the user opts out.
  const active = waiting && !dismissed
  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let timeout: ReturnType<typeof setTimeout>
    let clear: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = 8000 + Math.random() * 4000 // 8–12s
      timeout = setTimeout(() => {
        setWiggling(true)
        clear = setTimeout(() => setWiggling(false), 600)
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      clearTimeout(timeout)
      clearTimeout(clear)
      setWiggling(false)
    }
  }, [active])

  // Reveal-then-open: while collapsed a click reveals; once revealed a click opens.
  // On web, mouse-over reveals first, so a single click opens; on touch there's no
  // hover, so it's two taps.
  function handleClick() {
    setDismissed(true)
    if (expanded) {
      setExpanded(false)
      onOpen()
    } else {
      setExpanded(true)
    }
  }

  // Collapsed peek leaves the icon + a sliver of the pill on-screen (≈3.4rem) so the
  // launcher is always recognisable; expanding slides the full label into view.
  const peek = expanded
    ? 'translate-x-0'
    : onLeft
      ? '-translate-x-[calc(100%-3.4rem)]'
      : 'translate-x-[calc(100%-3.4rem)]'

  const skin = onLeft
    ? 'left-0 rounded-r-full border border-l-0 border-border bg-surface/90 text-broadcast-strong backdrop-blur-sm'
    : 'right-0 rounded-l-full bg-primary/90 text-on-primary'

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
      } ${skin} ${peek} ${wiggling ? 'edge-pill-wiggle' : ''}`}
    >
      {/* Self-contained wiggle keyframes — a small rotate/translate nudge that runs once
          per fired interval. No-op under prefers-reduced-motion. */}
      <style>{`
        @keyframes edgePillWiggle {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          20%      { transform: rotate(-4deg) translateX(-1px); }
          40%      { transform: rotate(3deg) translateX(1px); }
          60%      { transform: rotate(-2deg); }
          80%      { transform: rotate(1deg); }
        }
        .edge-pill-wiggle { animation: edgePillWiggle 500ms ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .edge-pill-wiggle { animation: none; }
        }
      `}</style>
      <span className="relative shrink-0">{icon}</span>
      <span className="relative whitespace-nowrap">{label}</span>
    </button>
  )
}
