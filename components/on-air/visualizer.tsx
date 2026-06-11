'use client'

// The On Air breath visualizer — the RippleRings motif, breathing (ADR-229).
// Rings bloom on the inhale, rest luminous on the hold, settle on the exhale.
// The animation writes transforms imperatively via rAF + refs so the rest of
// the screen never re-renders at frame rate. Reduced motion swaps the scale
// for a gentle opacity fade. Token colors only.

import { useEffect, useRef, useState } from 'react'
import { breathPositionAt, ringScaleAt, type BreathPattern } from '@/lib/on-air'

export function BreathVisualizer({
  pattern,
  startedAt,
}: {
  pattern: BreathPattern
  /** ms epoch when the session started — the shared clock. */
  startedAt: number
}) {
  const groupRef = useRef<SVGGElement>(null)
  const [label, setLabel] = useState(pattern.phases[0]?.label ?? 'Breathe in')
  const reduceMotion = useRef(false)

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let frame: number
    let lastLabel = ''
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const scale = ringScaleAt(pattern, elapsed)
      const g = groupRef.current
      if (g) {
        if (reduceMotion.current) {
          g.style.transform = ''
          g.style.opacity = String(0.45 + (scale - 0.62) / (1 - 0.62) * 0.55)
        } else {
          g.style.transform = `scale(${scale})`
        }
      }
      const { phase } = breathPositionAt(pattern, elapsed)
      if (phase.label !== lastLabel) {
        lastLabel = phase.label
        setLabel(phase.label)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pattern, startedAt])

  return (
    <div className="flex flex-col items-center gap-6">
      <svg viewBox="0 0 200 200" className="h-56 w-56 text-primary sm:h-64 sm:w-64" aria-hidden>
        <g
          ref={groupRef}
          style={{ transformOrigin: '100px 100px', transform: 'scale(0.62)' }}
        >
          {[36, 56, 76, 94].map((r, i) => (
            <circle
              key={r}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={i === 0 ? 2.5 : 1.75}
              opacity={0.9 - i * 0.2}
            />
          ))}
          <circle cx="100" cy="100" r="7" fill="currentColor" opacity="0.95" />
        </g>
      </svg>
      <p
        key={label}
        className="text-base font-medium tracking-wide text-muted"
        aria-live="polite"
      >
        {label}
      </p>
    </div>
  )
}
