'use client'

// The reveal — four swipeable panels after a session ends (ADR-229): Rewards →
// Streak → Stats → Dispatch from Vera. The streak increment and the bonus
// cascade are staged HERE, inside the flow (the Duolingo lesson: the state
// change is the payoff of the session, never a badge discovered later).
// Horizontal scroll-snap; each panel wears its own spot scene (reveal-art).
// P4 motion: the zap number counts up, the streak ticks N-1 → N with a pulse,
// and a one-shot dot burst fires behind the zaps. All of it bows out under
// prefers-reduced-motion (final values render immediately).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Zap, Gem, Flame, Shield, Radio, ChevronLeft, ChevronRight } from 'lucide-react'
import { RewardsArt, StreakArt, StatsArt, DispatchArt } from './reveal-art'
import type { RevealPayload } from '@/lib/on-air'

const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60)
  return m < 1 ? '<1 min' : `${m.toLocaleString()} min`
}

// Read prefers-reduced-motion once, in a state initializer (SSR-guarded; the
// reveal only mounts client-side after a session saves, so no hydration risk).
function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  return reduced
}

// Count 0 → target over `duration` ms, eased out. Render-pure: frames land via
// setState from a rAF loop inside an effect. Reduced motion (or a zero target)
// shows the final value immediately.
function useCountUp(target: number, duration: number, reduced: boolean): number {
  // Reduced motion (or a zero target) starts AND stays at the final value.
  const [value, setValue] = useState(() => (reduced || target <= 0 ? target : 0))
  useEffect(() => {
    if (reduced || target <= 0) return
    let frame = 0
    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(eased * target))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduced])
  return value
}

// The quiet celebration: a one-shot ring of tiny token-colored dots radiating
// out from behind the zap number, gone in about a second. Angles and distances
// are randomized once in a state initializer (never during render); reduced
// motion renders nothing at all.
type BurstDot = {
  angle: number
  distance: number
  size: number
  delay: number
  tone: 'primary' | 'signal'
}

function makeBurstDots(): BurstDot[] {
  const count = 10
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
    distance: 38 + Math.random() * 26,
    size: 3 + Math.random() * 3,
    delay: Math.random() * 120,
    tone: i % 3 === 0 ? ('signal' as const) : ('primary' as const),
  }))
}

function CelebrationBurst() {
  const reduced = usePrefersReducedMotion()
  const [dots] = useState<BurstDot[]>(() => (reduced ? [] : makeBurstDots()))
  const [fired, setFired] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (dots.length === 0) return
    const fire = setTimeout(() => setFired(true), 30)
    const settle = setTimeout(() => setDone(true), 1300)
    return () => {
      clearTimeout(fire)
      clearTimeout(settle)
    }
  }, [dots.length])

  if (dots.length === 0 || done) return null
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {dots.map((d, i) => (
        <span
          key={i}
          className={`absolute left-1/2 top-1/2 block rounded-full ${
            d.tone === 'signal' ? 'bg-signal' : 'bg-primary'
          }`}
          style={{
            width: d.size,
            height: d.size,
            marginLeft: -d.size / 2,
            marginTop: -d.size / 2,
            opacity: fired ? 0 : 0.9,
            transform: fired
              ? `translate(${Math.cos(d.angle) * d.distance}px, ${Math.sin(d.angle) * d.distance}px) scale(0.4)`
              : 'translate(0px, 0px) scale(1)',
            transition: `transform 900ms cubic-bezier(0.16, 1, 0.3, 1) ${d.delay}ms, opacity 880ms ease-out ${d.delay}ms`,
          }}
        />
      ))}
    </span>
  )
}

export function Reveal({
  payload,
  onClose,
  onAction,
}: {
  payload: RevealPayload
  /** The feed exit: swiping off the last card, "Back to feed", or pulling down. */
  onClose?: () => void
  /** Overlay-only: drop the takeover AFTER the Dispatch card's contextual link
   *  has navigated (so it doesn't sit over the deep-linked page). Undefined on
   *  the /on-air route, where the link navigation unmounts the surface itself. */
  onAction?: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState(0)
  const closed = useRef(false)
  const [dismissing, setDismissing] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // Swiping past the last card lands on a ghost panel that closes the mode —
  // the card slides off the screen and On Air is done (P5).
  const close = () => {
    if (closed.current) return
    closed.current = true
    onClose?.()
  }

  // Pull-down to close (P12): a clearly-vertical downward drag on ANY card
  // swipes the whole reveal down and out. The threshold is DELIBERATE (B.2): a
  // light touch on the Dispatch card must not dismiss it, so the drag has to be a
  // long, clearly-vertical pull (>= 150px and well past any horizontal travel),
  // not the old ~80px nudge. Horizontal swipes keep paging.
  const dismiss = () => {
    if (closed.current || dismissing) return
    setDismissing(true)
    setTimeout(close, 260)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchStart.current
    if (!s || !onClose) return
    const t = e.touches[0]
    const dy = t.clientY - s.y
    const dx = Math.abs(t.clientX - s.x)
    if (dy > 150 && dy > dx * 2) {
      touchStart.current = null
      dismiss()
    }
  }
  const onTouchEnd = () => {
    touchStart.current = null
  }

  // The Dispatch is the LAST card; swiping it off the edge onto the trailing ghost
  // panel closes the mode. That close is DECOUPLED from a tiny scroll (B.2): it no
  // longer fires the moment the scroll rounds toward the ghost (which let a light
  // nudge past the Dispatch, or momentum carried over from the Stats card, close it).
  // It fires ONLY when the ghost panel is FULLY scrolled into view — a committed,
  // deliberate swipe. The dots still track the four real panels (0..3).
  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const w = el.clientWidth
    setPanel(Math.min(Math.round(el.scrollLeft / w), 3))
    // Fully committed to the trailing ghost panel (index 4): within a few px of its
    // left edge, so a half-swipe that snaps back to the Dispatch never closes.
    if (onClose && w > 0 && el.scrollLeft >= 4 * w - 6) close()
  }

  const go = (idx: number) => {
    const el = scroller.current
    el?.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
  }
  const next = () => {
    if (panel >= 3) {
      // From the last card the arrow does what the swipe does: off and out.
      if (onClose) go(4)
      return
    }
    go(panel + 1)
  }
  const prev = () => go(Math.max(0, panel - 1))

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`flex min-h-full flex-1 flex-col transition-[transform,opacity] duration-300 ease-in motion-reduce:transition-none ${
        dismissing ? 'translate-y-[70vh] opacity-0' : ''
      }`}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Panel>
          <RewardsPanel payload={payload} />
        </Panel>
        <Panel>
          <StreakPanel payload={payload} />
        </Panel>
        <Panel>
          <StatsPanel payload={payload} />
        </Panel>
        <Panel>
          <DispatchPanel payload={payload} onClose={onClose} onAction={onAction} />
        </Panel>
        {/* The ghost panel: swiping the last card off the edge closes the mode. */}
        {onClose && (
          <section aria-hidden className="w-full shrink-0 snap-center" />
        )}
      </div>

      {/* Swipe rail: chevrons flank the dots; the right one walks the cards and,
          from the last card, swipes it off and closes the mode. */}
      <div className="flex items-center justify-center gap-5 py-4">
        <button
          type="button"
          onClick={prev}
          disabled={panel === 0}
          aria-label="Previous card"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === panel ? 'w-5 bg-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          aria-label={panel >= 3 ? 'Tune back in' : 'Next card'}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-6 py-8 text-center">
      {children}
    </section>
  )
}

// ① Rewards — the zap number counts up, then the bonus cascade.
function RewardsPanel({ payload }: { payload: RevealPayload }) {
  const reduced = usePrefersReducedMotion()
  const zaps = useCountUp(payload.zapsAwarded, 700, reduced)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    // Stage the bonuses in one at a time — a cascade, not a dump.
    if (shown >= payload.bonuses.length) return
    const t = setTimeout(() => setShown((s) => s + 1), 550)
    return () => clearTimeout(t)
  }, [shown, payload.bonuses.length])

  return (
    <div className="w-full max-w-sm">
      <RewardsArt className="mx-auto h-24 w-auto" />
      {payload.logged ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-subtle">
            {payload.practiceTitle} · logged
          </p>
          <p className="relative mt-2 flex items-center justify-center gap-2 text-5xl font-bold tabular-nums text-text">
            <CelebrationBurst />
            <Zap className="h-9 w-9 text-primary" strokeWidth={2.5} />+{zaps}
          </p>
          {payload.welcomeBack && (
            <p className="mt-3 text-sm text-muted">Good to see you. One practice at a time.</p>
          )}
          <div className="mt-5 space-y-2">
            {payload.bonuses.slice(0, shown).map((b, i) => (
              <div
                key={`${b.label}-${i}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated/60 px-3 py-2 text-sm"
              >
                <span className="font-medium text-text">{b.label}</span>
                <span className="flex items-center gap-1 font-semibold tabular-nums text-primary-strong">
                  {b.kind === 'gems' ? <Gem className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                  +{b.amount}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-subtle">
            {payload.practiceTitle}
          </p>
          <p className="mt-2 text-2xl font-bold text-text">Already counted today</p>
          <p className="mt-2 text-sm text-muted">
            The extra sit still banks airtime. The streak holds.
          </p>
        </>
      )}
    </div>
  )
}

// ② Streak — the number that ticks over: N-1 on mount, a beat, then N with a
// small pulse. Only when this session actually logged (an "already counted"
// sit never moved the streak, so nothing pretends to tick).
function StreakPanel({ payload }: { payload: RevealPayload }) {
  const { streak } = payload
  const reduced = usePrefersReducedMotion()
  const animate = !reduced && payload.logged && streak.current > 0
  const [ticked, setTicked] = useState(!animate)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (!animate) return
    const tick = setTimeout(() => {
      setTicked(true)
      setPulse(true)
    }, 400)
    const settle = setTimeout(() => setPulse(false), 750)
    return () => {
      clearTimeout(tick)
      clearTimeout(settle)
    }
  }, [animate])
  const shownStreak = ticked ? streak.current : streak.current - 1
  const pct = streak.nextMilestone
    ? Math.min(100, Math.round((streak.current / streak.nextMilestone.day) * 100))
    : 100
  return (
    <div className="w-full max-w-sm">
      <StreakArt className="mx-auto h-24 w-auto" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-subtle">Streak</p>
      <p className="mt-2 flex items-center justify-center gap-2 text-6xl font-bold tabular-nums text-text">
        <Flame className="h-10 w-10 text-primary" />
        <span
          className={`inline-block transition-transform duration-300 ${
            pulse ? 'scale-110' : 'scale-100'
          }`}
        >
          {shownStreak}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {streak.current === 1 ? 'day. Every run starts here.' : `days in a row. Best ever: ${streak.longest}.`}
      </p>
      {streak.nextMilestone && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-border/60">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-subtle">
            {streak.toNext} {streak.toNext === 1 ? 'day' : 'days'} to {streak.nextMilestone.label}
          </p>
        </div>
      )}
      {streak.freezeTokens > 0 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-muted">
          {Array.from({ length: streak.freezeTokens }).map((_, i) => (
            <Shield key={i} className="h-3.5 w-3.5 text-signal" />
          ))}
          {streak.freezeTokens === 1 ? '1 freeze banked' : `${streak.freezeTokens} freezes banked`}
        </p>
      )}
    </div>
  )
}

// ③ Stats — airtime + depth + Amplitude.
function StatsPanel({ payload }: { payload: RevealPayload }) {
  const { stats } = payload
  const rows: [string, string][] = [
    // Named after what was actually done (ADR-443): "This walk" / "This sit", never crossed.
    [stats.sessionLabel, fmtMin(stats.sessionSeconds)],
    ['Airtime today', fmtMin(stats.todaySeconds)],
    ['Airtime, all time', fmtMin(stats.totalSeconds)],
    [
      payload.practiceTitle,
      stats.nextDepthMark
        ? `${stats.lifetimeLogs} logs · ${stats.nextDepthMark} next`
        : `${stats.lifetimeLogs} logs`,
    ],
    ['Amplitude', `Level ${stats.amplitudeLevel} · ${stats.amplitude.toLocaleString()}`],
  ]
  return (
    <div className="w-full max-w-sm">
      <StatsArt className="mx-auto h-24 w-auto" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-subtle">Stats</p>
      <div className="mt-4 space-y-2 text-left">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated/60 px-3 py-2 text-sm"
          >
            <span className="truncate text-muted">{k}</span>
            <span className="ml-3 shrink-0 font-semibold tabular-nums text-text">{v}</span>
          </div>
        ))}
      </div>
      <Link href="/crew/leaderboard" className="mt-4 inline-block text-xs font-semibold text-primary-strong hover:underline">
        Full stats →
      </Link>
    </div>
  )
}

// ④ Dispatch from Vera — built from the member's real state at the moment the
// sit ended (practices still to log today, or an RSVP'd gathering, or all done).
// The action button is the contextual deep-link Vera mentioned; "Back to feed"
// (and swiping the card off) always lands the member on the feed (tasks #9/#10).
function DispatchPanel({
  payload,
  onClose,
  onAction,
}: {
  payload: RevealPayload
  onClose?: () => void
  onAction?: () => void
}) {
  const { dispatch } = payload
  const [chars, setChars] = useState(0)
  useEffect(() => {
    if (chars >= dispatch.copy.length) return
    const t = setTimeout(() => setChars((c) => Math.min(dispatch.copy.length, c + 2)), 18)
    return () => clearTimeout(t)
  }, [chars, dispatch.copy.length])

  // The contextual action already IS "back to the feed" in the done/nothing-pending
  // case; route it through the close handler (drops the takeover over the feed in
  // overlay mode, pushes the feed on the route) instead of a hard navigation that
  // leaves the overlay mounted.
  const actionIsFeed = dispatch.actionHref === '/feed'

  return (
    <div className="w-full max-w-sm">
      <DispatchArt className="mx-auto mb-4 h-24 w-auto" />
      <div className="rounded-2xl border border-primary/50 bg-primary-bg/30 p-5 text-left shadow-sm">
        <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-primary-strong">
          <Radio className="h-3.5 w-3.5" /> Incoming · Dispatch from Vera
        </p>
        <p className="mt-3 min-h-[3.5rem] text-base font-medium leading-relaxed text-text">
          {dispatch.copy.slice(0, chars)}
          {chars < dispatch.copy.length && <span className="animate-pulse">▍</span>}
        </p>
        {dispatch.actionHref &&
          (actionIsFeed && onClose ? (
            // "Back to feed" through the close path: in overlay mode this drops the
            // takeover over the feed; on the /on-air route it pushes the feed.
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {dispatch.actionLabel} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            // A contextual deep-link (Practices, an event). Navigate there AND, in
            // overlay mode, drop the takeover so it doesn't sit over the new page.
            // On the route, onAction is undefined and the link navigation unmounts
            // the surface on its own (no extra push to the feed).
            <Link
              href={dispatch.actionHref}
              onClick={() => onAction?.()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {dispatch.actionLabel} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ))}
      </div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <Link href="/on-air/dispatches" className="text-xs font-semibold text-subtle hover:text-text">
          Past Dispatches
        </Link>
        {/* A feed exit alongside the contextual CTA. Skipped when the CTA itself
            is already "Back to feed" (the done/nothing-pending case), so the card
            never shows two identical buttons. Through the close path so the
            overlay tears down (overlay mode) or the route pushes the feed, never
            a hard nav that leaves the takeover stacked over the page. */}
        {!actionIsFeed &&
          (onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-subtle hover:text-text"
            >
              Back to feed
            </button>
          ) : (
            <Link href="/feed" className="text-xs font-semibold text-subtle hover:text-text">
              Back to feed
            </Link>
          ))}
      </div>
    </div>
  )
}
