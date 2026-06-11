'use client'

// The reveal — four swipeable panels after a session ends (ADR-229): Rewards →
// Streak → Stats → Dispatch from Vera. The streak increment and the bonus
// cascade are staged HERE, inside the flow (the Duolingo lesson: the state
// change is the payoff of the session, never a badge discovered later).
// Horizontal scroll-snap; vector art rides the existing brand motifs.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Zap, Gem, Flame, Shield, Radio, ChevronRight } from 'lucide-react'
import { FrequencyArcs, RippleRings } from '@/components/marketing/vector-art'
import type { RevealPayload } from '@/lib/on-air'

const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60)
  return m < 1 ? '<1 min' : `${m.toLocaleString()} min`
}

export function Reveal({ payload }: { payload: RevealPayload }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState(0)

  const onScroll = () => {
    const el = scroller.current
    if (el) setPanel(Math.round(el.scrollLeft / el.clientWidth))
  }

  const next = () => {
    const el = scroller.current
    el?.scrollTo({ left: (panel + 1) * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
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
          <DispatchPanel payload={payload} />
        </Panel>
      </div>

      {/* Dots + advance. The last panel's actions live in the panel itself. */}
      <div className="flex items-center justify-center gap-4 py-4">
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
        {panel < 3 && (
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
        )}
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

// ① Rewards — the zap number, then the bonus cascade.
function RewardsPanel({ payload }: { payload: RevealPayload }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    // Stage the bonuses in one at a time — a cascade, not a dump.
    if (shown >= payload.bonuses.length) return
    const t = setTimeout(() => setShown((s) => s + 1), 550)
    return () => clearTimeout(t)
  }, [shown, payload.bonuses.length])

  return (
    <div className="w-full max-w-sm">
      <FrequencyArcs className="mx-auto h-20 w-auto text-primary" />
      {payload.logged ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-subtle">
            {payload.practiceTitle} · logged
          </p>
          <p className="mt-2 flex items-center justify-center gap-2 text-5xl font-bold tabular-nums text-text">
            <Zap className="h-9 w-9 text-primary" strokeWidth={2.5} />+{payload.zapsAwarded}
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

// ② Streak — the number that ticks over.
function StreakPanel({ payload }: { payload: RevealPayload }) {
  const { streak } = payload
  const pct = streak.nextMilestone
    ? Math.min(100, Math.round((streak.current / streak.nextMilestone.day) * 100))
    : 100
  return (
    <div className="w-full max-w-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Streak</p>
      <p className="mt-2 flex items-center justify-center gap-2 text-6xl font-bold tabular-nums text-text">
        <Flame className="h-10 w-10 text-primary" />
        {streak.current}
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
    ['This sit', fmtMin(stats.sessionSeconds)],
    ['Airtime today', fmtMin(stats.todaySeconds)],
    ['Airtime, all time', fmtMin(stats.totalSeconds)],
    [
      payload.practiceTitle,
      stats.nextDepthMark
        ? `${stats.lifetimeLogs} logs · ${stats.nextDepthMark - stats.lifetimeLogs} to ${stats.nextDepthMark} Deep`
        : `${stats.lifetimeLogs} logs`,
    ],
    ['Amplitude', `Level ${stats.amplitudeLevel} · ${stats.amplitude.toLocaleString()}`],
  ]
  return (
    <div className="w-full max-w-sm">
      <RippleRings className="mx-auto h-20 w-20 text-signal" />
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
      <Link href="/crew/streaks" className="mt-4 inline-block text-xs font-semibold text-primary-strong hover:underline">
        Full stats →
      </Link>
    </div>
  )
}

// ④ Dispatch from Vera — the next assignment, typed on. Cached server-side;
// revisits replay this copy, never a live generation.
function DispatchPanel({ payload }: { payload: RevealPayload }) {
  const { dispatch } = payload
  const [chars, setChars] = useState(0)
  useEffect(() => {
    if (chars >= dispatch.copy.length) return
    const t = setTimeout(() => setChars((c) => Math.min(dispatch.copy.length, c + 2)), 18)
    return () => clearTimeout(t)
  }, [chars, dispatch.copy.length])

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-primary/50 bg-primary-bg/30 p-5 text-left shadow-sm">
        <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-primary-strong">
          <Radio className="h-3.5 w-3.5" /> Incoming · Dispatch from Vera
        </p>
        <p className="mt-3 min-h-[3.5rem] text-base font-medium leading-relaxed text-text">
          {dispatch.copy.slice(0, chars)}
          {chars < dispatch.copy.length && <span className="animate-pulse">▍</span>}
        </p>
        {dispatch.actionHref && (
          <Link
            href={dispatch.actionHref}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {dispatch.actionLabel} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-5 flex items-center justify-center gap-4">
        <Link href="/on-air/dispatches" className="text-xs font-semibold text-subtle hover:text-text">
          Past Dispatches
        </Link>
        <Link href="/feed" className="text-xs font-semibold text-subtle hover:text-text">
          Off air, back home
        </Link>
      </div>
    </div>
  )
}
