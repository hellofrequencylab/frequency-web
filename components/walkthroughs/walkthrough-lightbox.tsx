'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { X, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import type { Walkthrough } from '@/lib/walkthroughs'
import { WalkthroughSlide } from '@/components/walkthroughs/slide'
import { completeWalkthroughAction } from '@/app/(main)/walkthrough-actions'

// Walkthroughs Phase B — the slide deck. A focused overlay that opens ONLY when the
// member taps "Start" on the gentle in-feed card (never an auto-popup). It walks the
// walkthrough's steps with the shared <WalkthroughSlide>, Back/Next and a progress-dots
// row, a close (X), and on the last slide a "Finish" that records completion (and pays
// any step zaps, server-side) then closes. Closing early does nothing special — the card
// already marked the walkthrough seen when it showed. Reuses the vera-lightbox /
// chores-overlay visual language (centered modal over a bg-black/70 backdrop), focus +
// ESC + scroll-lock, and respects prefers-reduced-motion.

export function WalkthroughLightbox({
  walkthrough,
  onClose,
  previewOnly = false,
}: {
  walkthrough: Walkthrough
  onClose: () => void
  /** Operator preview (e.g. /pages/sequences): walk the slides but DON'T record
   *  completion or pay zaps on Finish — just close. */
  previewOnly?: boolean
}) {
  const steps = walkthrough.steps
  const [index, setIndex] = useState(0)
  const [pending, start] = useTransition()
  const last = index >= steps.length - 1

  const close = useCallback(() => onClose(), [onClose])

  // Lock body scroll + ESC-to-close while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [close])

  function back() {
    setIndex((i) => Math.max(0, i - 1))
  }
  function next() {
    setIndex((i) => Math.min(steps.length - 1, i + 1))
  }
  function finish() {
    if (pending) return
    if (previewOnly) {
      close()
      return
    }
    start(async () => {
      await completeWalkthroughAction(walkthrough.slug)
      close()
    })
  }

  const step = steps[index]
  if (!step) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 motion-safe:animate-in motion-safe:fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={walkthrough.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="relative w-full max-w-lg">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute -top-2 -right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-lg transition-colors hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <WalkthroughSlide step={step} />

        {/* Progress dots */}
        {steps.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-surface' : 'w-1.5 bg-surface/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:text-white disabled:opacity-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>

          <span className="text-xs font-medium text-white/70">
            {index + 1} of {steps.length}
          </span>

          {last ? (
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-5 py-2 text-sm font-semibold text-text shadow-lg transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-5 py-2 text-sm font-semibold text-text shadow-lg transition-colors hover:bg-surface-elevated"
            >
              Next <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
