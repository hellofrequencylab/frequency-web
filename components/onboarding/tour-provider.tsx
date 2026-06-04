'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'
import { TIPS, type Tip } from '@/lib/onboarding/tips'
import { selectTip, type TourState } from '@/lib/onboarding/select'
import { recordTourEvent } from '@/app/onboarding/tour-actions'

// The deterministic onboarding cue (ADR-047 P1). One small, calm coachmark at a
// time as the member navigates — never a blocking wizard, never a thing they've
// already done. Best-practice "cue + respond" behaviour:
//   • CUE      — pops in (animate-cue-pop), anchored next to the content it's about
//                (the avatar, the feed) rather than a fixed corner.
//   • RECEDE   — after 5s of no mouse movement it fades to neutral so it never
//                nags; any mouse movement (or hovering it) brings it back.
//   • RESPOND  — one primary action + an always-there dismiss. Both are recorded.
// `satisfied` carries the member's completed activation steps so a cue for a done
// task (e.g. "add a photo" when they have one) is never shown (the suppression also
// happens in selectTip; this is the data that powers it).

const IDLE_MS = 5000

interface Pos { top: number; left: number }

function computePosition(anchor: string, box: HTMLElement): Pos | null {
  const el = document.querySelector<HTMLElement>(`[data-tour-anchor="${anchor}"]`)
  if (!el) return null
  const a = el.getBoundingClientRect()
  if (a.width === 0 && a.height === 0) return null // not laid out / hidden
  const b = box.getBoundingClientRect()
  const m = 12
  const edge = 8
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left: number
  let top: number
  const isRegion = a.width > 480 || a.height > 320
  if (isRegion) {
    // A content region (e.g. the feed): tuck into its top-left.
    left = a.left + m
    top = a.top + m
  } else {
    // A point element (e.g. the avatar): sit beside it, vertically centered.
    left = a.right + m
    if (left + b.width + edge > vw) left = a.left - b.width - m // flip to the left side
    top = a.top + a.height / 2 - b.height / 2
  }
  // Keep it fully on screen.
  left = Math.min(Math.max(edge, left), vw - b.width - edge)
  top = Math.min(Math.max(edge, top), vh - b.height - edge)
  return { top, left }
}

export function TourProvider({
  initialState,
  satisfied = [],
}: {
  initialState: TourState
  /** Completed activation step keys — cues for these are suppressed. */
  satisfied?: string[]
}) {
  const pathname = usePathname()
  const [state, setState] = useState<TourState>(initialState)
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const [dimmed, setDimmed] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Pick the next eligible cue for this route (one at a time).
  useEffect(() => {
    if (tip) return
    const next = selectTip(TIPS, state, pathname, Date.now(), new Set(satisfied))
    if (!next) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setTip(next)
    setState((s) => ({ ...s, seen: [...s.seen, next.id], lastShownAt: new Date().toISOString() }))
    /* eslint-enable react-hooks/set-state-in-effect */
    void recordTourEvent(next.id, 'seen')
  }, [pathname, state, tip, satisfied])

  // Anchor the cue next to its content (measured pre-paint, recomputed on resize).
  useLayoutEffect(() => {
    if (!tip?.anchor || !boxRef.current) {
      setPos(null)
      return
    }
    const place = () => {
      if (boxRef.current) setPos(computePosition(tip.anchor!, boxRef.current))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [tip])

  // Recede when idle: dim after 5s of stillness; any movement (or hover) restores.
  useEffect(() => {
    if (!tip) return
    // Reset to bright when a new cue appears, then arm the idle timer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDimmed(false)
    let timer = window.setTimeout(() => setDimmed(true), IDLE_MS)
    let lastReset = Date.now()
    const wake = () => {
      setDimmed((d) => (d ? false : d))
      const now = Date.now()
      if (now - lastReset > 400) {
        lastReset = now
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setDimmed(true), IDLE_MS)
      }
    }
    window.addEventListener('mousemove', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
    }
  }, [tip])

  if (!tip) return null

  const close = (kind?: 'dismissed' | 'cta') => {
    if (kind) void recordTourEvent(tip.id, kind)
    setTip(null)
    setPos(null)
  }

  const anchored = pos !== null

  return (
    <div
      ref={boxRef}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setDimmed(false)}
      style={anchored ? { top: pos.top, left: pos.left } : undefined}
      className={`fixed z-40 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3.5 shadow-pop transition-opacity duration-500 motion-safe:animate-cue-pop ${
        anchored ? '' : 'inset-x-4 bottom-24 mx-auto md:inset-x-auto md:bottom-8 md:left-8'
      } ${dimmed ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">{tip.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">{tip.body}</p>
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
          className="-mr-1 -mt-1 rounded-lg p-1 text-subtle transition-colors hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
