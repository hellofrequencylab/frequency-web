'use client'

// THE LIVE STAGE (LIVE-2393; redrawn under LIVE-2406 from the Claude Design timer of 2026-11-18,
// direction A): the one running screen for Be Still and Get Moving.
//
//   • the time is one big number over a thin bar that fills as the session (or a Get Moving phase)
//     runs, so it reads at a glance from across a room;
//   • a Breathe session keeps the orb, which moves with the breath, with the cue and the count
//     under it;
//   • the practice and style are named, the end time is said in the member's own clock ("Ends
//     6:42 pm"), and a Get Moving plan names its phase in a pill with "Round 3 of 8";
//   • one primary pill (Begin now, Pause, Resume, Finish) with the two ways out as text under it.
//     After a few idle seconds of a running session everything but the clock steps back; any
//     touch, key or focus brings it back. Space pauses.
//
// Presentational only. Both engines keep every rule they own (the clock, the warm-up, the run-over
// gate, the bank) and hand this their read-outs. Tokens only (docs/THEME.md).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Footprints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressTrack, type ProgressTone } from '@/components/ui/progress-track'
import { breathPositionAt, ringScaleAt, type BreathPattern } from '@/lib/on-air'
import { LotusIcon } from './icons'
import type { TimerMode } from './mindless'
import { RoomWash, endsAtLabel } from './stage-room'

export { endsAtLabel }

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

const BAR: Record<'still' | 'move' | 'work' | 'rest' | 'closing', ProgressTone> = { still: 'primary-strong', move: 'move', work: 'success', rest: 'warning', closing: 'danger' }

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
  const chrome = `transition-opacity duration-700 motion-reduce:transition-none ${quiet ? 'opacity-10' : 'opacity-100'}`
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
  const style = eyebrow.split(' · ').pop() ?? eyebrow
  const moveFill = mode === 'move' ? { background: 'var(--color-move)', color: 'var(--color-text-on-move)' } : undefined

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] overflow-y-auto bg-canvas" data-live-stage={mode} data-live-state={state} data-quiet={quiet ? 'true' : undefined}>
      <RoomWash fill={fill} />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-107.5 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className={`flex flex-col items-center gap-1.5 text-center ${chrome}`}>
          <p className="m-0 flex items-center justify-center gap-2 text-body-sm font-medium text-text">
            {mode === 'move' ? <Footprints className="h-4 w-4" aria-hidden /> : <LotusIcon className="h-4 w-4" aria-hidden />} {mode === 'move' ? 'Get Moving' : 'Mindless'}
          </p>
          <h1 className="m-0 text-balance text-body-sm font-normal text-muted">
            {title}
            <span aria-hidden> · </span>
            <span className="sr-only">, </span>
            {style}
          </h1>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
          {showBreath && (
            <div className="relative aspect-square w-[min(44vw,24dvh,11rem)] shrink-0" aria-hidden>
              <span className="absolute inset-0 rounded-pill opacity-50 blur-2xl" style={{ background: fill }} />
              <span ref={discRef} className={`absolute inset-0 rounded-pill ring-1 ring-inset ring-surface/70 ${state === 'paused' ? 'opacity-70' : ''}`} style={{ background: fill, transform: 'scale(0.62)' }} />
            </div>
          )}
          {showBreath && (
            <p className="serif m-0 text-display-card text-text" aria-live="polite">
              {cue.label}
              {showCount && cue.count !== null && <span className="ml-2 font-sans text-body-lg not-italic tabular-nums text-muted" aria-hidden>{cue.count}</span>}
            </p>
          )}
          {accent && !showBreath && (
            <div className={`flex flex-col items-center gap-2 ${chrome}`}>
              <span className={`flex h-9 items-center gap-2 rounded-pill px-4 text-meta font-semibold uppercase tracking-[0.14em] ${accent === 'work' ? 'bg-text text-surface' : 'text-text ring-[1.5px] ring-inset ring-text'}`}>
                <span aria-hidden className={`h-2.5 w-2.5 ${accent === 'work' ? 'rounded-[2px] bg-surface' : 'rounded-pill ring-[1.5px] ring-inset ring-text'}`} />
                {clockLabel}
              </span>
              {rounds && rounds.total > 1 && <span className="text-body font-medium text-text" data-rounds>Round {rounds.current} of {rounds.total}</span>}
            </div>
          )}

          <div className="flex flex-col items-center gap-3" role="timer" aria-label={`${clock} ${clockLabel}`}>
            <span className={`font-display font-medium leading-none tracking-[-0.04em] tabular-nums text-display-hero ${closing ? 'text-danger' : 'text-text'} ${state === 'paused' ? 'opacity-60' : ''}`}>{clock}</span>
            {arc !== null && (
              <span className="block w-60 max-w-[70vw]" data-live-bar>
                <ProgressTrack value={arc * 100} label="Session progress" tone={BAR[closing ? 'closing' : (accent ?? mode)]} track="border" animate />
              </span>
            )}
            {!accent && !showBreath && <span className={`text-body-sm font-medium text-text ${chrome}`}>{LABELS[clockLabel.toLowerCase()] ?? clockLabel}</span>}
          </div>

          <div className={`flex min-h-12 w-full max-w-sm flex-col items-center gap-1.5 ${chrome}`}>
            {!accent && rounds && rounds.total > 1 && <span className="text-body-sm font-medium text-text" data-rounds>Round {rounds.current} of {rounds.total}</span>}
            {children}
            {endsAt && <p className="m-0 text-meta tabular-nums text-muted">Ends {endsAt}</p>}
          </div>
        </div>

        {prompt}

        <div className={`sticky bottom-0 -mx-5 flex flex-col items-center gap-1 px-5 pb-1 pt-3 ${chrome}`}>
          {/* The one action fill: the kit's practice gradient for Be Still, the move colour for Get Moving. */}
          <Button type="button" onClick={primary.onClick} size="lg" className={`h-15 w-full rounded-pill ${mode === 'move' ? '' : 'fq-pa'}`} style={moveFill}>
            {primary.label}
          </Button>
          <div className="flex items-center justify-center gap-4">
            <button type="button" onClick={onCancel} className="h-11 px-3 text-body-sm font-medium text-muted hover:text-danger" aria-label="Cancel, don’t log">
              Cancel
            </button>
            <button type="button" onClick={finish.onClick} className="h-11 px-3 text-body-sm font-medium text-muted hover:text-text">
              {finish.label}
            </button>
          </div>
        </div>
      </div>
      {flash && <div aria-hidden className={`animate-warmup-flash pointer-events-none fixed inset-0 z-[70] motion-reduce:hidden ${mode === 'move' ? 'bg-move/40' : 'bg-primary/40'}`} />}
    </div>
  )
}

/** The engines' short clock labels, said the way the design says them. */
const LABELS: Record<string, string> = { 'warm up': 'Get settled', left: '', 'min left': '' }

/** The moments either side of the reveal (LIVE-2395): the save, and a save that failed. The same orb
 *  as the door's room, so finishing never drops the member onto a bare page. Content only: the
 *  engine's own takeover hosts it. */
export function StageNotice({
  mode, tone, title, body, action,
}: {
  mode: TimerMode
  /** `working`: the orb breathes. `problem`: the orb dims and the action shows. */
  tone: 'working' | 'problem'
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
}) {
  const fill = orbFillFor(mode)
  const working = tone === 'working'
  return (
    <div className="mx-auto flex w-full max-w-107.5 flex-1 flex-col items-center justify-center gap-6 px-5 py-6 text-center" data-stage-notice={tone} role={working ? 'status' : 'alert'}>
      <RoomWash fill={fill} />
      <div className="relative h-30 w-30 shrink-0" aria-hidden>
        <span className={`absolute inset-0 rounded-pill blur-2xl ${working ? 'fq-breathe opacity-50 motion-reduce:animate-none' : 'opacity-25'}`} style={{ background: fill }} />
        <span className={`absolute inset-0 rounded-pill ring-1 ring-inset ring-surface/70 ${working ? 'fq-breathe motion-reduce:animate-none' : 'opacity-45 saturate-50'}`} style={{ background: fill }} />
      </div>
      <div className="flex max-w-xs flex-col items-center gap-2">
        <p className="m-0 text-balance font-display text-display-card font-medium tracking-tight text-text">{title}</p>
        {body && <p className="m-0 text-body-sm text-muted">{body}</p>}
      </div>
      {action && (
        <Button type="button" onClick={action.onClick} size="lg" className={`h-14 w-full max-w-xs rounded-pill ${mode === 'move' ? '' : 'fq-pa'}`} style={mode === 'move' ? { background: 'var(--color-move)', color: 'var(--color-text-on-move)' } : undefined}>
          {action.label}
        </Button>
      )}
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
