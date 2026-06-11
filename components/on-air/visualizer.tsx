'use client'

// The On Air breath visualizer — the RippleRings motif, breathing (ADR-229).
// Rings bloom on the inhale, rest luminous on the hold, settle on the exhale;
// holds breathe in luminosity (one soft cosine dip per hold). A per-phase
// seconds counter flashes in the center of the rings so you can count the
// breath with your eyes half-closed (P5). The animation writes transforms
// imperatively via rAF + refs so the rest of the screen never re-renders at
// frame rate. Reduced motion swaps the scale for a gentle opacity fade.
// Token colors only.

import { useEffect, useRef, useState } from 'react'
import { breathPositionAt, ringScaleAt, type BreathPattern } from '@/lib/on-air'

export function BreathVisualizer({
  pattern,
  startedAt,
  showCount = true,
  paused = false,
}: {
  pattern: BreathPattern
  /** ms epoch when the session started — the shared clock. */
  startedAt: number
  /** Flash the per-phase seconds count in the center of the rings. */
  showCount?: boolean
  /** Freeze the rings mid-frame (P10 pause / after the clock hits zero). The
   *  parent shifts startedAt on resume, so the breath picks up where it left. */
  paused?: boolean
}) {
  const groupRef = useRef<SVGGElement>(null)
  const [label, setLabel] = useState(pattern.phases[0]?.label ?? 'Breathe in')
  const [count, setCount] = useState<number | null>(null)
  const reduceMotion = useRef(false)
  const pausedRef = useRef(paused)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let frame: number
    let lastLabel = ''
    let lastCount = -1
    const tick = () => {
      if (pausedRef.current) {
        frame = requestAnimationFrame(tick)
        return
      }
      const elapsed = (Date.now() - startedAt) / 1000
      const scale = ringScaleAt(pattern, elapsed)
      const pos = breathPositionAt(pattern, elapsed)
      const g = groupRef.current
      if (g) {
        if (reduceMotion.current) {
          g.style.transform = ''
          g.style.opacity = String(0.45 + (scale - 0.62) / (1 - 0.62) * 0.55)
        } else {
          g.style.transform = `scale(${scale})`
          // Holds breathe in luminosity instead of size: one soft dip and
          // return across the phase (cosine, so it lands back at full exactly
          // as the next phase starts). Written via the ref, never React state.
          if (pos.phase.kind === 'hold') {
            const dip = 0.5 - Math.cos(2 * Math.PI * pos.phaseProgress) / 2
            g.style.opacity = String(1 - 0.12 * dip)
          } else {
            g.style.opacity = ''
          }
        }
      }
      if (pos.phase.label !== lastLabel) {
        lastLabel = pos.phase.label
        setLabel(pos.phase.label)
      }
      // The breath count: seconds remaining in the current phase, 4 → 3 → 2 → 1.
      const remainingInPhase = Math.max(1, Math.ceil(pos.phase.seconds - pos.phaseElapsed))
      if (remainingInPhase !== lastCount) {
        lastCount = remainingInPhase
        setCount(remainingInPhase)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pattern, startedAt])

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <svg
          viewBox="0 0 200 200"
          className="h-72 w-72 text-primary sm:h-80 sm:w-80"
          aria-hidden
        >
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
          </g>
        </svg>
        {showCount && count !== null && (
          <span
            key={`${label}-${count}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl font-bold tabular-nums text-primary-strong"
            style={{ animation: 'none', opacity: 0.92 }}
          >
            {count}
          </span>
        )}
      </div>
      <p
        key={label}
        className="text-lg font-medium tracking-wide text-muted"
        aria-live="polite"
      >
        {label}
      </p>
    </div>
  )
}
