'use client'

// THE LIVE STAGE (LIVE-2393): the one running screen for Be Still and Get Moving. The door was
// redesigned on the Frequency member design system (LIVE-2245); the screen a member actually sits
// with was not: a grey clock on a white page for a sit, a green ring for a walk, two layouts that
// shared nothing with the door. This is the door's orb, carried through:
//
//   • the same orb the member set their length on is now the clock face, inside a thin ring that
//     fills as the session runs (or as a Get Moving phase runs), so the time left reads at a glance
//     from across a room without reading a number;
//   • a Breathe session moves the orb itself with the breath, with the cue and the count on it;
//   • the practice is named, the end time is said in the member's own clock ("Ends 6:42 pm"), and
//     a Get Moving plan shows its rounds as dots;
//   • the controls sit in one dock: one primary pill (Begin now, Pause, Resume, Finish) and the
//     two ways out side by side. After a few idle seconds of a running session the chrome steps
//     back so only the orb is lit; any touch, key or focus brings it back. Space pauses.
//
// Presentational only. Both engines keep every rule they own (the clock, the warm-up, the run-over
// gate, the bank) and hand this their read-outs. Tokens only (docs/THEME.md); the orb number sits
// on the pale orb in day and night, so it reads in the fixed ink, like the door.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Pause, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { breathPositionAt, ringScaleAt, type BreathPattern } from '@/lib/on-air'
import { LotusIcon } from './icons'
import type { TimerMode } from './mindless'

/** The orb's fill for a mode: the design's practice orb for Be Still, the move accent for Get Moving.
 *  The same two fills the door paints its orb with (components/on-air/compact-setup.tsx). */
export function orbFillFor(mode: TimerMode): string {
  return mode === 'move'
    ? 'radial-gradient(circle at 35% 30%, var(--color-surface) 0, var(--color-presence-bg) 34%, color-mix(in oklab, var(--color-move) 45%, var(--color-surface)) 100%)'
    : 'var(--design-practice-orb)'
}

export type LiveState = 'warmup' | 'running' | 'paused' | 'ended'

/** How long a running session sits untouched before the chrome steps back. */
export const QUIET_AFTER_MS = 6000

const RING_R = 96
const RING_C = 2 * Math.PI * RING_R

/** "6:42 pm" in the member's own clock and locale. */
export function endsAtLabel(now: number, remainingSec: number): string {
  return new Date(now + remainingSec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

export interface LiveStageProps {
  mode: TimerMode
  state: LiveState
  /** The warm-up wash as the session begins. */
  flash?: boolean
  /** The small line over the title: "Be Still · Meditate". */
  eyebrow: string
  /** The practice by name. */
  title: string
  /** The big read-out on the orb: "19:56", "+1:20", or the warm-up count. */
  clock: string
  /** The small caps under it: "left", "warm up", "work". */
  clockLabel: string
  /** 0 to 1 around the ring; null draws no arc (open-ended, or warming up). */
  progress: number | null
  /** The last three seconds of a phase: the ring and the number turn to the danger tone. */
  closing?: boolean
  /** A tone for the ring and label that overrides the mode's (a Get Moving work or rest phase). */
  accent?: 'work' | 'rest' | null
  /** Seconds until the target lands, for the "Ends 6:42 pm" line. Null hides it. */
  remainingSec?: number | null
  /** Breathe: the orb moves with this pattern and carries the cue instead of the clock. */
  breath?: { pattern: BreathPattern; startedAt: number } | null
  /** Breathe: show the seconds left in the phase on the orb. */
  showCount?: boolean
  /** Get Moving rounds, drawn as dots under the orb. */
  rounds?: { current: number; total: number } | null
  /** The lines under the orb: the target, what is next, the tier cue, a note field. */
  children?: ReactNode
  /** A card above the dock (the run-over check). */
  prompt?: ReactNode
  primary: { label: string; onClick: () => void }
  finish: { label: string; onClick: () => void }
  onCancel: () => void
}

const ACCENT: Record<'still' | 'move' | 'work' | 'rest' | 'closing', string> = {
  still: 'text-primary-strong',
  move: 'text-move',
  work: 'text-success',
  rest: 'text-warning',
  closing: 'text-danger',
}

export function LiveStage({
  mode, state, flash = false, eyebrow, title, clock, clockLabel, progress, closing = false, accent = null, remainingSec = null,
  breath = null, showCount = false, rounds = null, children, prompt, primary, finish, onCancel,
}: LiveStageProps) {
  const running = state === 'running'
  const quiet = useQuiet(running)
  const endsAt = useEndsAt(running ? remainingSec : null)
  const discRef = useRef<HTMLSpanElement>(null)
  const cue = useBreath(breath, state === 'paused' || state === 'warmup', discRef)
  const fill = orbFillFor(mode)
  const tone = ACCENT[closing ? 'closing' : (accent ?? mode)]
  const chrome = `transition-opacity duration-700 motion-reduce:transition-none ${quiet ? 'opacity-35' : 'opacity-100'}`
  const arc = progress === null ? null : Math.min(1, Math.max(0, progress))
  const primaryRef = useRef(primary.onClick)
  useEffect(() => { primaryRef.current = primary.onClick })

  // Space is the pause key, the way every player works, unless the member is typing or on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return
      e.preventDefault()
      primaryRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const showBreath = !!breath && state !== 'warmup'
  const Icon = state === 'ended' ? Check : state === 'running' ? Pause : Play

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] overflow-y-auto bg-canvas" data-live-stage={mode} data-live-state={state} data-quiet={quiet ? 'true' : undefined}>
      {/* The room: the orb's own colour, wide and soft, so the page is lit by the session. */}
      <span aria-hidden className="pointer-events-none fixed left-1/2 top-[38%] h-[70dvh] w-[70dvh] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-pill opacity-35 blur-3xl" style={{ background: fill }} />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <p className={`m-0 flex items-center justify-center gap-2 eyebrow text-muted ${chrome}`}>
          <LotusIcon className="h-4 w-4" aria-hidden /> Mindless
        </p>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
          <div className={`flex flex-col items-center gap-1.5 ${chrome}`}>
            <p className={`m-0 eyebrow ${ACCENT[mode]}`}>{eyebrow}</p>
            <h1 className="m-0 text-balance font-display text-display-card font-medium tracking-tight text-text">{title}</h1>
          </div>

          <div className="relative aspect-square w-[min(74vw,44dvh,23rem)] shrink-0" role="timer" aria-label={`${clock} ${clockLabel}`}>
            <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
              <circle cx="100" cy="100" r={RING_R} fill="none" strokeWidth="2" className="stroke-current text-border" />
              {arc !== null && (
                <circle
                  cx="100" cy="100" r={RING_R} fill="none" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - arc)}
                  className={`stroke-current transition-[stroke-dashoffset,color] duration-1000 ease-linear motion-reduce:transition-none ${tone}`}
                />
              )}
            </svg>
            <span aria-hidden className={`absolute inset-[4%] rounded-pill opacity-50 blur-2xl ${running && !breath ? 'fq-breathe motion-reduce:animate-none' : ''}`} style={{ background: fill }} />
            <span
              ref={discRef}
              aria-hidden
              className={`absolute inset-[7%] rounded-pill ring-1 ring-inset ring-surface/70 ${running && !breath ? 'fq-breathe motion-reduce:animate-none' : ''} ${state === 'paused' ? 'opacity-70' : ''}`}
              style={{ background: fill, transform: showBreath ? 'scale(0.62)' : undefined }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-ink">
              {showBreath ? (
                <>
                  <span className="font-display text-display-card font-medium tracking-tight" aria-live="polite">{cue.label}</span>
                  {showCount && cue.count !== null && <span className="font-display text-display-h2 font-medium leading-none tabular-nums" aria-hidden>{cue.count}</span>}
                </>
              ) : (
                <>
                  <span className={`font-display text-display-h1 font-medium leading-none tracking-[-0.05em] tabular-nums ${closing ? 'text-danger' : ''}`}>{clock}</span>
                  <span className="eyebrow opacity-70" style={{ color: 'inherit' }}>{clockLabel}</span>
                </>
              )}
            </div>
          </div>

          {rounds && rounds.total > 1 && rounds.total <= 20 && (
            <ol className={`m-0 flex list-none flex-wrap items-center justify-center gap-1.5 p-0 ${chrome}`} aria-label={`Round ${rounds.current} of ${rounds.total}`}>
              {Array.from({ length: rounds.total }, (_, i) => (
                <li key={i} aria-hidden className={`h-1.5 rounded-pill transition-all motion-reduce:transition-none ${i + 1 < rounds.current ? 'w-1.5 bg-move' : i + 1 === rounds.current ? 'w-5 bg-move' : 'w-1.5 bg-border'}`} />
              ))}
            </ol>
          )}

          <div className={`flex min-h-12 w-full max-w-sm flex-col items-center gap-2 ${chrome}`}>
            {showBreath && <p className="m-0 font-display text-display-card font-medium tabular-nums text-text">{clock} <span className="eyebrow text-muted">{clockLabel}</span></p>}
            {children}
            {endsAt && <p className="m-0 text-meta tabular-nums text-muted">Ends {endsAt}</p>}
          </div>
        </div>

        {prompt}

        <div className={`sticky bottom-0 -mx-6 flex flex-col items-center gap-2 bg-canvas/80 px-6 pb-1 pt-3 backdrop-blur-md ${chrome}`}>
          {/* The one action fill: the kit's primary pill for Be Still, the move accent for Get Moving. */}
          <Button type="button" onClick={primary.onClick} size="lg" className="w-full max-w-xs" style={mode === 'move' ? { background: 'var(--color-move)', color: 'var(--color-text-on-move)' } : undefined}>
            <Icon className="h-4.5 w-4.5" aria-hidden /> {primary.label}
          </Button>
          <div className="flex w-full max-w-xs items-center justify-between gap-2">
            <Button type="button" onClick={onCancel} variant="ghost" size="sm" className="text-muted hover:text-danger" aria-label="Cancel, don’t log">
              <X className="h-4 w-4" aria-hidden /> Cancel
            </Button>
            <Button type="button" onClick={finish.onClick} variant="ghost" size="sm">
              <Check className="h-4 w-4" aria-hidden /> {finish.label}
            </Button>
          </div>
        </div>
      </div>
      {flash && <div aria-hidden className={`animate-warmup-flash pointer-events-none fixed inset-0 z-[70] motion-reduce:hidden ${mode === 'move' ? 'bg-move/40' : 'bg-primary/40'}`} />}
    </div>
  )
}

/** True once a running session has gone untouched for a few seconds. Any pointer, key or focus wakes it. */
function useQuiet(running: boolean): boolean {
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    if (!running) return
    let id = window.setTimeout(() => setQuiet(true), QUIET_AFTER_MS)
    const wake = () => {
      setQuiet(false)
      window.clearTimeout(id)
      id = window.setTimeout(() => setQuiet(true), QUIET_AFTER_MS)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const
    for (const e of events) document.addEventListener(e, wake, { passive: true })
    return () => {
      window.clearTimeout(id)
      for (const e of events) document.removeEventListener(e, wake)
      setQuiet(false)
    }
  }, [running])
  return running && quiet
}

/** The wall-clock time the target lands, recomputed as the minutes fall. Null while paused or open-ended. */
function useEndsAt(remainingSec: number | null): string | null {
  const [label, setLabel] = useState<string | null>(null)
  const minute = remainingSec !== null && remainingSec > 0 ? Math.ceil(remainingSec / 60) : null
  const latest = useRef(remainingSec)
  useEffect(() => { latest.current = remainingSec })
  useEffect(() => {
    const r = latest.current
    setLabel(minute !== null && r !== null ? endsAtLabel(Date.now(), r) : null)
  }, [minute])
  return label
}

/** Moves the orb with the breath (written through the ref, never React state) and names the phase. */
function useBreath(
  breath: LiveStageProps['breath'],
  frozen: boolean,
  disc: React.RefObject<HTMLSpanElement | null>,
): { label: string; count: number | null } {
  const [cue, setCue] = useState<{ label: string; count: number | null }>({ label: breath?.pattern.phases[0]?.label ?? '', count: null })
  const pattern = breath?.pattern
  const startedAt = breath?.startedAt
  useEffect(() => {
    if (!pattern || startedAt === undefined || frozen) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    let lastLabel = ''
    let lastCount = -1
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const scale = ringScaleAt(pattern, elapsed)
      const pos = breathPositionAt(pattern, elapsed)
      const el = disc.current
      if (el) {
        if (still) {
          el.style.transform = ''
          el.style.opacity = String(0.45 + ((scale - 0.62) / 0.38) * 0.55)
        } else {
          el.style.transform = `scale(${scale})`
        }
      }
      const count = Math.max(1, Math.ceil(pos.phase.seconds - pos.phaseElapsed))
      if (pos.phase.label !== lastLabel || count !== lastCount) {
        lastLabel = pos.phase.label
        lastCount = count
        setCue({ label: pos.phase.label, count })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pattern, startedAt, frozen, disc])
  return cue
}
