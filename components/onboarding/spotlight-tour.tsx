'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Sparkles, ArrowRight, ArrowLeft, Pause, X } from 'lucide-react'
import type { SpotlightStop } from '@/lib/onboarding/spotlight'
import { setSpotlightTourState } from '@/app/onboarding/tour-actions'

// The guided spotlight tour (the "site tour" Vera walks new members through). It
// dims the whole page and cuts a lit window around one real surface at a time
// (anchored via `data-tour-anchor`), with a narration card beside it and
// Next / Back / Pause. Best-practice modal behaviour: focus moves into the card,
// ESC pauses, body scroll locks, reduced-motion friendly. When an anchor isn't on
// screen the card centers and still narrates — so it degrades gracefully on small
// viewports where the sidebar nav lives in a drawer.

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8 // breathing room around the lit element
const GAP = 14 // distance from the lit element to the card

// An anchor can appear more than once (the same nav item renders in both the
// desktop sidebar and the mobile drawer), so pick the first one that's actually
// laid out on screen rather than `querySelector`'s first-in-DOM (often the hidden
// drawer copy).
function visibleAnchor(anchor: string | undefined): HTMLElement | null {
  if (!anchor) return null
  const els = document.querySelectorAll<HTMLElement>(`[data-tour-anchor="${anchor}"]`)
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

export function SpotlightTour({
  stops,
  startStop = 0,
  onExit,
}: {
  stops: SpotlightStop[]
  /** Resume from a given stop (the guide remembers where you paused). */
  startStop?: number
  /** Called when the tour closes — `completed` true only if they reached the end. */
  onExit: (completed: boolean) => void
}) {
  const [i, setI] = useState(() => Math.min(Math.max(0, startStop), stops.length - 1))
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const stop = stops[i]
  const last = i >= stops.length - 1
  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Measure the anchored element (and scroll it into view first). No anchor, or a
  // hidden/zero-size element → no rect → the card centers.
  const measure = useCallback(() => {
    const el = visibleAnchor(stop.anchor)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [stop])

  // Scroll the target into view when the stop changes, then measure (and keep
  // measuring on resize/scroll so the lit window tracks the element).
  useLayoutEffect(() => {
    const el = visibleAnchor(stop.anchor)
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const id = window.setTimeout(measure, reduce ? 0 : 260)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, stop, reduce])

  // Place the card: below the lit element if there's room, else above, else center.
  // (Measures the card + viewport, so state is set straight from the layout effect.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    if (!rect) { setCardPos(null); return }
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const edge = 12
    let top = rect.top + rect.height + GAP
    if (top + ch + edge > vh) top = rect.top - ch - GAP // flip above
    top = Math.min(Math.max(edge, top), vh - ch - edge)
    let left = rect.left + rect.width / 2 - cw / 2 // center on the element
    left = Math.min(Math.max(edge, left), vw - cw - edge)
    setCardPos({ top, left })
  }, [rect, i])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus the card, lock scroll, ESC = pause.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cardRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') pause()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft' && i > 0) setI((n) => n - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  function next() {
    if (last) {
      void setSpotlightTourState('completed', i)
      onExit(true)
    } else {
      setI((n) => n + 1)
    }
  }
  function pause() {
    void setSpotlightTourState('paused', i)
    onExit(false)
  }

  const anchored = !!rect && !!cardPos

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="spotlight-title">
      {/* Dim layer + lit window. The box-shadow trick dims everything except the
          padded rect; with no rect we fall back to a flat full-screen scrim. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/62" />
      )}

      {/* Narration card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        style={anchored ? { top: cardPos!.top, left: cardPos!.left } : undefined}
        className={`absolute w-[320px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-surface p-4 shadow-2xl outline-none motion-safe:animate-cue-pop ${
          anchored ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary-strong">Vera</p>
            <h2 id="spotlight-title" className="mt-0.5 text-sm font-bold text-text">{stop.title}</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">{stop.body}</p>
          </div>
          <button
            type="button"
            onClick={pause}
            aria-label="Pause tour"
            className="-mr-1 -mt-1 rounded-lg p-1 text-subtle transition-colors hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Progress dots */}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {stops.map((s, n) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-primary' : n < i ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border-strong'}`}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-1 text-xs font-medium text-subtle transition-colors hover:text-muted"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI((n) => n - 1)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {last ? 'Done' : 'Next'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-center text-2xs tabular-nums text-subtle">
          {i + 1} of {stops.length}
        </p>
      </div>
    </div>
  )
}
