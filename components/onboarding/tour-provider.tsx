'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'
import { TIPS, type Tip } from '@/lib/onboarding/tips'
import { selectTip, type TourState } from '@/lib/onboarding/select'
import { recordTourEvent } from '@/app/onboarding/tour-actions'

// The deterministic onboarding tour (ADR-047 Phase 1). Shows one paced center
// coachmark at a time as the member navigates — never a blocking wizard. Records
// 'seen' on show (so it never repeats + advances the cooldown). Vera's voice; the
// AI concierge (Phase 2) will later replace the static copy with live conversation.
export function TourProvider({ initialState }: { initialState: TourState }) {
  const pathname = usePathname()
  const [state, setState] = useState<TourState>(initialState)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    if (tip) return // one coachmark at a time
    const next = selectTip(TIPS, state, pathname, Date.now())
    if (!next) return
    // Navigation-reactive show-once: surfacing a tip is inherently a state update
    // in response to route + persisted state, guarded so it can't loop (a shown
    // tip is added to `seen`, and `tip` truthiness early-returns).
    /* eslint-disable react-hooks/set-state-in-effect */
    setTip(next)
    setState((s) => ({ ...s, seen: [...s.seen, next.id], lastShownAt: new Date().toISOString() }))
    /* eslint-enable react-hooks/set-state-in-effect */
    void recordTourEvent(next.id, 'seen')
  }, [pathname, state, tip])

  if (!tip) return null

  const close = (kind?: 'dismissed' | 'cta') => {
    if (kind) void recordTourEvent(tip.id, kind)
    setTip(null)
  }

  return (
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-pop md:inset-x-auto md:bottom-8 md:left-8 motion-safe:animate-in">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">{tip.title}</p>
          <p className="mt-1 text-sm text-muted">{tip.body}</p>
          {tip.cta && (
            <Link
              href={tip.cta.href}
              onClick={() => close('cta')}
              className="mt-2.5 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {tip.cta.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => close('dismissed')}
          aria-label="Dismiss"
          className="rounded-lg p-1 text-subtle transition-colors hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
