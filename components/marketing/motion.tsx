'use client'

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

// ── Motion kit for the marketing pages ────────────────────────────────────────
// Small, tasteful, scroll-driven effects. Every one degrades to "fully visible,
// no movement" under `prefers-reduced-motion: reduce` (handled in globals.css)
// and when JS never runs (SSR / no-JS): the reveal base state is overridden by a
// `@media (scripting: none)` rule so content is never trapped invisible. None of
// these touch layout (no CLS) — they animate opacity and transform only.
//
// ⚠️ THIS KIT USED TO BE FOUR COMPONENTS. `Parallax`, `CountUp` and `ScrollCue` were built for the
// coded home splash (ADR-1050) and had NO other caller; they were deleted with it when `/` went
// template-only (Lift 5c, ADR-1068), along with the reduced-motion hook only `Parallax` used.
// `git log -p` on this file is the only remaining copy. If a BLOCK ever wants that motion, it
// belongs in lib/page-editor/config.tsx — not in a route file (scripts/render-path-bodies.txt).

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

// Fade + rise into view when scrolled to. Renders as any element via `as`.
export function Reveal({
  children,
  as: Tag = 'div',
  className = '',
  delay = 0,
}: {
  children: ReactNode
  as?: ElementType
  className?: string
  /** Stagger in ms — applied via the CSS custom property the `.reveal` rule reads. */
  delay?: number
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Reduced-motion visibility is handled entirely in CSS, so we only wire the
    // observer when motion is welcome (avoids any synchronous reveal here).
    if (window.matchMedia(REDUCE_QUERY).matches) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // boundingClientRect.top < 0: the element is already ABOVE the viewport (the
          // visitor skipped past it before the observer attached — fast scroll, anchor
          // jump). Latching only on isIntersecting left those at opacity 0 forever.
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            setRevealed(true)
            io.disconnect()
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`reveal ${revealed ? 'is-revealed' : ''} ${className}`}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  )
}
