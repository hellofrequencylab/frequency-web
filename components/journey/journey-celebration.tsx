'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Gem, X, Sparkles } from 'lucide-react'

// The full-screen "Journey complete" celebration (docs/JOURNEYS.md §6, §10 — the
// dopamine moment). Mirrors the global-toast pattern (a window CustomEvent + a mounted
// container) so the Log button can fire it from anywhere without prop-drilling. Reduced
// motion is respected via the shared keyframes (which no-op under prefers-reduced-motion).
//
// Mount <JourneyCelebrationStage /> once on the Journey page; call fireJourneyComplete()
// when a logPracticeAction result carries a "Journey complete" bonus.

const EVENT = 'journey-complete'

export interface JourneyCompleteDetail {
  title: string
  gems?: number
}

function Burst() {
  // A ring of token-colored sparks. Purely decorative; no layout impact.
  const sparks = Array.from({ length: 12 })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {sparks.map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-primary motion-reduce:hidden"
          style={{
            transform: `rotate(${(360 / sparks.length) * i}deg) translateY(-120px)`,
            opacity: 0.7,
            animation: 'cue-pop 600ms cubic-bezier(0.34,1.56,0.64,1) both',
            animationDelay: `${i * 35}ms`,
          }}
        />
      ))}
    </div>
  )
}

function CelebrationCard({ detail, onDismiss }: { detail: JourneyCompleteDetail; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Journey complete"
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-primary-bg bg-surface p-8 text-center shadow-2xl animate-[slideUp_0.45s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <Burst />
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-lg p-1 text-subtle transition-colors hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-bg text-primary-strong animate-[cue-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)]">
          <Trophy className="h-10 w-10" strokeWidth={1.75} />
        </div>

        <p className="mt-5 inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-primary-strong">
          <Sparkles className="h-3.5 w-3.5" /> Journey complete
        </p>
        <h2 className="mt-1.5 text-balance text-xl font-bold text-text">{detail.title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
          You banked the season. A permanent completion badge is yours.
        </p>

        {detail.gems != null && detail.gems > 0 && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-signal-bg px-4 py-2 text-sm font-bold text-signal-strong">
            <Gem className="h-4 w-4" /> +{detail.gems} gems
          </div>
        )}

        <button
          onClick={onDismiss}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Keep going
        </button>
      </div>
    </div>
  )
}

/** Mount once on the Journey page. Listens for fireJourneyComplete(). */
export function JourneyCelebrationStage() {
  const [detail, setDetail] = useState<JourneyCompleteDetail | null>(null)
  const dismiss = useCallback(() => setDetail(null), [])

  useEffect(() => {
    function handle(e: Event) {
      const d = (e as CustomEvent<JourneyCompleteDetail>).detail
      if (d) setDetail(d)
    }
    window.addEventListener(EVENT, handle)
    return () => window.removeEventListener(EVENT, handle)
  }, [])

  if (!detail) return null
  return <CelebrationCard detail={detail} onDismiss={dismiss} />
}

/** Fire the full-screen celebration. No-op on the server. */
export function fireJourneyComplete(detail: JourneyCompleteDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail }))
}
