'use client'

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ElementType,
  type ReactNode,
} from 'react'
import { ChevronDown } from 'lucide-react'

// ── Motion kit for the marketing splash ───────────────────────────────────────
// Small, tasteful, scroll-driven effects. Every one degrades to "fully visible,
// no movement" under `prefers-reduced-motion: reduce` (handled in globals.css)
// and when JS never runs (SSR / no-JS): the reveal base state is overridden by a
// `@media (scripting: none)` rule so content is never trapped invisible. None of
// these touch layout (no CLS) — they animate opacity and transform only.

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReduced(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(REDUCE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false, // SSR snapshot — assume motion is fine, CSS still guards visibility
  )
}

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
          if (entry.isIntersecting) {
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

// Light parallax — translates a layer a fraction of the scroll distance while it
// is on screen. `speed` is the fraction of travel (negative = moves up slower).
// Reduced motion disables it entirely (element renders static).
export function Parallax({
  children,
  speed = -0.12,
  className = '',
}: {
  children: ReactNode
  speed?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      // Progress from -1 (just below viewport) to 1 (just above).
      const progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2)
      el.style.transform = `translate3d(0, ${progress * speed * 100}px, 0)`
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [reduced, speed])

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </div>
  )
}

// Number that counts up to its target the first time it scrolls into view.
// Initial state is the final value, so SSR / no-JS / reduced-motion all show the
// real number immediately; the animation only runs for motion-OK viewers.
export function CountUp({
  value,
  className = '',
  duration = 1400,
}: {
  value: number
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [display, setDisplay] = useState(value)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia(REDUCE_QUERY).matches) return // show final value, no anim
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return
        started.current = true
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
          setDisplay(Math.round(eased * value))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [value, duration])

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString()}
    </span>
  )
}

// Hero scroll cue — a soft-bouncing chevron (bounce honored in globals.css).
export function ScrollCue({ label }: { label: string }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-2 text-white/45">
      <span className="text-[11px] font-bold tracking-widest uppercase">{label}</span>
      <ChevronDown className="w-5 h-5 animate-cue" aria-hidden />
    </div>
  )
}
