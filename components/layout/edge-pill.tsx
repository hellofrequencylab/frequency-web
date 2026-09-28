'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// The two edge TABS — Vera (right) and Next Steps (left) — share THIS one component
// so they're identical in size + behaviour on web and mobile. Each is a tab tucked
// flush into the screen margin (rounded only on its inner edge), not a floating pill:
//   • collapsed it shows ONLY its icon, peeking from the edge;
//   • WEB: mouse-over reveals the label; a click then opens its panel;
//   • MOBILE: first tap reveals it; a second tap opens its panel;
//   • when something's waiting, the tab does an OCCASIONAL WIGGLE (a brief shake every
//     ~8–12s) instead of a constant glow — a quiet "psst", honoured for reduced motion.
export function EdgePill({
  side,
  label,
  icon,
  waiting = false,
  badgeCount = 0,
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
  /** Numeric unread count shown as a small badge over the icon (0 = hidden). */
  badgeCount?: number
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

  // 🔴 SHOWN IS A LAYOUT FACT, AND THE TIMER READS IT (LIVE-484). This tab is mounted on every
  // member page: components/vera/vera-launcher.tsx renders it as the no-dock fallback inside
  // `<span className="hidden md:block">`, so below md it is in the DOM and display:none. The
  // wiggle below used to key off `waiting` alone, which meant every phone-width member page ran
  // a self-rescheduling 8 to 12 second timer for the life of the session, calling setState to
  // toggle a class on a box nobody could see, plus the 600ms timer to toggle it back. A React
  // render every ten seconds, forever, on the surface where battery matters most, to animate
  // nothing.
  //
  // The test is the tab's OWN rendered box, read the way the launcher reads the dock slot:
  // `getClientRects().length`, NOT `offsetParent`, because this button is `position: fixed` and
  // offsetParent is null for a fixed element on every desktop too. It is re-read on resize
  // because crossing the md breakpoint changes display without a navigation or a prop, so a
  // desktop window narrowed to a phone stops the timer and a phone rotated wide starts it.
  // Gating the mount in the launcher instead would need a second copy of the breakpoint in
  // JavaScript; reading the box keeps the CSS the only place `md` is spelled.
  const ref = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const read = () => setShown(!!ref.current && ref.current.getClientRects().length > 0)
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Occasional wiggle: while waiting (and not yet acknowledged) AND actually on screen, fire a
  // brief shake on an interval (~8–12s, jittered) rather than a continuous animation. Respect
  // prefers-reduced-motion — no wiggle at all when the user opts out.
  const active = waiting && !dismissed && shown
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

  // A tab flush to the screen edge, rounded only on its inner side. At rest it shows
  // ONLY its icon (a sliver peeking from the margin); hover/tap slides the label out.
  // GEOMETRY CONTRACT: the right pill anchors the bottom-right stack — the Vault dock
  // (components/sidebar/game-stats-dock.tsx) computes its `bottom` offset from THIS
  // pill's md:bottom-6 + h-11 (+ gap). Change those and the dock's offset must follow.
  const skin = onLeft
    ? 'left-0 rounded-r-full border-y border-r border-border bg-surface/95 text-broadcast-strong backdrop-blur-sm'
    : 'right-0 rounded-l-full bg-primary/95 text-on-primary'

  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={handleClick}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      // The visual suite paints over this tab (test/e2e/surfaces.ts, VISUAL_MASK_SITES): its
      // badge count and its label ("3 chores") are live data, and the tab itself renders only
      // where no dock slot exists, which differs by route rather than by design.
      data-visual-mask="edge-pill"
      className={`fixed top-1/2 -translate-y-1/2 z-40 flex h-11 items-center justify-center text-body-sm font-semibold lift-1 transition-all duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] ${
        expanded
          ? `gap-1.5 px-4 ${onLeft ? 'flex-row-reverse pl-3' : 'pr-3'}`
          : 'w-7 md:w-11'
      } ${skin} ${wiggling ? 'edge-pill-wiggle' : ''}`}
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
      <span className="relative shrink-0">
        {icon}
        {badgeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-3xs font-bold text-on-danger">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </span>
      {expanded && <span className="relative whitespace-nowrap">{label}</span>}
    </button>
  )
}
