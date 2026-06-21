'use client'

// Movement — the live movement timer (WEBSITE-CHANGES-PLAN §4 C.6). A sibling of
// the Mindless sit (components/on-air/session.tsx): same takeover shell, same
// wake lock + true fullscreen, the same Web Audio cue voice, the same 250ms
// wall-clock tick + pause/resume math, and the SAME completeSession -> logPractice
// log path. The difference is the engine: instead of a single countdown it walks
// a movement plan (Walk / Run / Yoga / Strength / Stretch / Play) built by
// lib/movement.ts.
//
// The shape: setup (pick one of six modes + its preset, or tune Strength) -> live
// (a big M:SS, a round counter, the next-phase line, color-coded phases) -> the
// shared Reveal / log. Color reads the phase kind: work = success, rest = warning,
// the lead-in is neutral, and the final 3 seconds of any timed phase ring danger so
// the change is felt before it lands. Audio: a 3-2-1 countdown into each work phase,
// a bell on every phase change, the closing double-strike at the end.
//
// Completion economy: the live screen reports the ACTUAL elapsed seconds to
// completeSession, which measures them against the practice's authored target and
// pays a partial (>= 50%, 1 Zap) or a full reward. A "Finish Practice" resume opens
// mid-way (resumeFromSec already banked, secondsTarget the whole length): the clock
// runs the REMAINING time, and the total banked is resumeFromSec + this session.
//
// VOICE (docs/CONTENT-VOICE.md): plain, warm labels. No em or en dashes. Proper
// nouns (Tabata, EMOM) carry the magic. Tokens only, never hex (docs/THEME.md).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, X, Check } from 'lucide-react'
import { OnAirIcon } from './icons'
import { MovementArt } from '@/components/feed/zap-menu-art'
import { Reveal } from './reveal'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { chime, endChime, countBeep } from '@/lib/timer-audio'
import { bellToneBySlug } from '@/lib/on-air'
import type { OnAirPractice } from './session'
import {
  MOVEMENT_MODES,
  STRENGTH_PRESETS,
  YOGA_PRESETS,
  WALK_DURATION_PRESETS,
  WALK_INTERVAL_PRESETS,
  RUN_DURATION_PRESETS,
  RUN_INTERVAL_PRESETS,
  STRETCH_DURATION_PRESETS,
  STRETCH_INTERVAL_PRESETS,
  buildPlan,
  phaseAt,
  totalSeconds,
  clampRounds,
  clampSeconds,
  type MovementMode,
  type MovementConfig,
  type MovementPlan,
  type PhaseKind,
  type StrengthPresetKind,
  type YogaPresetKind,
} from '@/lib/movement'
import type { RevealPayload } from '@/lib/on-air'

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// The bell voice is fixed to the tuned default for Movement (the sit's voice
// picker is the place to choose one; here the cues are functional beats).
const TONE = bellToneBySlug('soft')

/** Vibration where supported (Android). iOS web has no vibration; never throw. */
function buzz(pulse: number | number[] = 15) {
  try {
    navigator.vibrate?.(pulse)
  } catch {
    // no vibration on this device
  }
}

/** The phase color: work banks success, rest warns, the lead-in is neutral. The
 *  final-3s danger ring is layered on top in the live screen, not here. */
function phaseTone(kind: PhaseKind): { text: string; ring: string; bg: string; label: string } {
  switch (kind) {
    case 'work':
      return { text: 'text-success', ring: 'ring-success/40', bg: 'bg-success-bg/40', label: 'Work' }
    case 'rest':
      return { text: 'text-warning', ring: 'ring-warning/40', bg: 'bg-warning-bg/40', label: 'Rest' }
    default:
      return { text: 'text-muted', ring: 'ring-border', bg: 'bg-surface-elevated', label: 'Ready' }
  }
}

/** The takeover shell, matching the Mindless Overlay (fixed, dvh-sized so the
 *  controls never hide behind mobile browser chrome). */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-5">{children}</div>
    </div>
  )
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function MovementSession({
  practices,
  defaultPracticeId,
  defaultMode,
  resumeFromSec = 0,
  secondsTarget,
  practicedToday = 0,
  onExit,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  /** The Movement mode this session opens on (from a practice's movement_config, or Walk). */
  defaultMode?: MovementMode | null
  /** "Finish Practice" resume: seconds already banked from an earlier partial sit. The
   *  live clock runs the REMAINING time and reports resumeFromSec + this session's
   *  elapsed as the total to completeSession. 0 = a fresh sit. */
  resumeFromSec?: number
  /** "Finish Practice" resume: the practice's full target length in seconds. Bounds the
   *  remaining run so the resume stops at the target, and feeds the completion messaging. */
  secondsTarget?: number
  /** Distinct members with a practice log today (presence line, shown at >=3). */
  practicedToday?: number
  /** Overlay mode: leaving CLOSES the overlay via this callback instead of navigating. */
  onExit?: () => void
}) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('setup')

  // --- setup state ----------------------------------------------------------
  const initialId =
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? ''
  const [practiceId, setPracticeId] = useState(initialId)
  const [mode, setMode] = useState<MovementMode>(defaultMode ?? 'walk')
  // Walk
  const [walkMinutes, setWalkMinutes] = useState(20)
  const [walkIntervalMin, setWalkIntervalMin] = useState(0)
  // Run
  const [runMinutes, setRunMinutes] = useState(20)
  const [runIntervalMin, setRunIntervalMin] = useState(0)
  // Yoga
  const [yogaKind, setYogaKind] = useState<YogaPresetKind>('vinyasa')
  // Stretch
  const [stretchMinutes, setStretchMinutes] = useState(10)
  const [stretchIntervalMin, setStretchIntervalMin] = useState(0)
  // Strength (a preset, plus tunable steppers that override it)
  const [strengthKind, setStrengthKind] = useState<StrengthPresetKind>('tabata')
  const [workSec, setWorkSec] = useState(20)
  const [restSec, setRestSec] = useState(10)
  const [rounds, setRounds] = useState(8)

  const practice = practices.find((p) => p.id === practiceId)

  // The config the setup screen has composed, and the plan it builds.
  const config: MovementConfig = useMemo(() => {
    switch (mode) {
      case 'walk':
        return { mode, walkMinutes, walkIntervalMin }
      case 'run':
        return { mode, runMinutes, runIntervalMin }
      case 'yoga':
        return { mode, yogaKind }
      case 'stretch':
        return { mode, stretchMinutes, stretchIntervalMin }
      case 'play':
        return { mode }
      case 'strength':
        return { mode, strengthKind, workSec, restSec, rounds }
      default:
        return { mode }
    }
  }, [
    mode,
    walkMinutes,
    walkIntervalMin,
    runMinutes,
    runIntervalMin,
    yogaKind,
    stretchMinutes,
    stretchIntervalMin,
    strengthKind,
    workSec,
    restSec,
    rounds,
  ])

  const plan = useMemo<MovementPlan>(() => buildPlan(config), [config])

  // "Finish Practice" resume: the seconds already banked from an earlier partial sit.
  // The live screen reads the plan from this offset (so the member picks up where the
  // plan left off), and the only time we COUNT is this session's own elapsed. Clamped
  // to the plan total so a resume never reads past the end. A fresh sit has offset 0.
  const resumeOffset = useMemo(() => {
    if (resumeFromSec <= 0) return 0
    const total = totalSeconds(plan)
    return total === null ? Math.round(resumeFromSec) : Math.min(Math.round(resumeFromSec), total)
  }, [resumeFromSec, plan])

  // The cap on what a finish can bank: the authored target on a "Finish Practice" resume
  // (secondsTarget), else the plan's own run length, else null for open-ended Play. The
  // server still owns the partial-vs-full economy decision; this only stops an overshoot.
  const finishCap = useMemo<number | null>(() => {
    if (resumeFromSec > 0 && typeof secondsTarget === 'number' && secondsTarget > 0) {
      return Math.round(secondsTarget)
    }
    return totalSeconds(plan)
  }, [resumeFromSec, secondsTarget, plan])

  // Seed the Strength steppers from the chosen preset (so picking Tabata fills
  // 20/10/8, then the member can tune from there).
  function pickStrength(kind: StrengthPresetKind) {
    const preset = STRENGTH_PRESETS.find((p) => p.kind === kind) ?? STRENGTH_PRESETS[0]
    setStrengthKind(kind)
    setWorkSec(preset.workSec)
    setRestSec(preset.restSec)
    setRounds(preset.rounds)
  }

  // --- live state -----------------------------------------------------------
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const lastPhaseLabel = useRef<string | null>(null)
  const lastBeep = useRef(-1)
  const lastWalkMinute = useRef(0)
  const endCued = useRef(false)

  // --- takeover plumbing (shared shape with the Mindless sit) ---------------
  async function acquireQuiet() {
    try {
      wakeLock.current =
        (await (navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock?.request('screen')) ?? null
    } catch {
      // wake lock is progressive enhancement
    }
    // True fullscreen, gesture-gated, so this only lands from the Start tap.
    await requestAppFullscreen()
  }

  async function releaseQuiet() {
    try {
      await wakeLock.current?.release()
    } catch {
      /* released already */
    }
    wakeLock.current = null
    await exitAppFullscreen()
  }

  // Re-acquire the wake lock when the tab comes back (the OS drops it on blur).
  useEffect(() => {
    const onVisible = () => {
      if (stage === 'live' && document.visibilityState === 'visible' && !wakeLock.current) {
        void acquireQuiet()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [stage])

  // Let the audio context go when the surface unmounts.
  useEffect(() => {
    const ctx = audio
    return () => {
      try {
        void ctx.current?.close()
      } catch {
        // already closed
      }
      ctx.current = null
    }
  }, [])

  // --- the clock ------------------------------------------------------------
  // One 250ms wall-clock tick walks `elapsed` against the plan via phaseAt, firing
  // the cues on transitions. Pauses shift startedAt forward so they never count.
  useEffect(() => {
    if (stage !== 'live') return
    const id = setInterval(() => {
      if (pausedAt !== null) return
      // This session's own elapsed. The plan is read from resumeOffset + elapsed so a
      // "Finish Practice" resume picks up where the earlier partial left off, while the
      // counter we bank (in finish) stays this session's elapsed plus what was banked.
      const e = (Date.now() - startedAt) / 1000
      setElapsed(e)

      const pos = phaseAt(plan, resumeOffset + e)

      // Phase change -> a bell + a small buzz. Lead-in into work, work into rest,
      // round to round all read here off the label changing.
      if (pos.phase.label !== lastPhaseLabel.current) {
        if (lastPhaseLabel.current !== null && !pos.done) {
          chime(audio.current, TONE)
          buzz(15)
        }
        lastPhaseLabel.current = pos.phase.label
      }

      // 3-2-1 countdown into the NEXT phase: when a timed phase is about to end,
      // beep on each of its final three whole seconds, the last one accented.
      if (pos.remaining !== null && !pos.done && pos.remaining <= 3) {
        const tick = Math.ceil(pos.remaining) // 3,2,1
        if (tick >= 1 && tick <= 3 && tick !== lastBeep.current) {
          lastBeep.current = tick
          countBeep(audio.current, 1, tick === 1)
        }
      } else {
        lastBeep.current = -1
      }

      // Interval reminder: a gentle chime on each chosen-minute mark, not a phase, so
      // the block stays one clean countdown. Walk = a nudge, Run = a split cue, Stretch
      // = a soft "switch sides." All three fire on the minute of the work block.
      const intervalMin =
        plan.mode === 'walk'
          ? walkIntervalMin
          : plan.mode === 'run'
            ? runIntervalMin
            : plan.mode === 'stretch'
              ? stretchIntervalMin
              : 0
      if (intervalMin > 0 && pos.phase.kind === 'work') {
        const minute = Math.floor(pos.phaseElapsed / 60)
        if (minute > lastWalkMinute.current) {
          lastWalkMinute.current = minute
          if (minute > 0 && minute % intervalMin === 0) chime(audio.current, TONE)
        }
      }

      // The end: the closing double-strike rings once, then the screen waits for
      // the member to Finish (no auto-advance), mirroring the sit.
      if (pos.done && !endCued.current) {
        endCued.current = true
        endChime(audio.current, TONE)
        buzz([30, 80, 30])
      }
    }, 250)
    return () => clearInterval(id)
  }, [stage, startedAt, pausedAt, plan, resumeOffset, walkIntervalMin, runIntervalMin, stretchIntervalMin])

  // --- transitions ----------------------------------------------------------
  async function start() {
    if (!practiceId) return
    // Unlock audio on the tap (autoplay policy only opens the context in a gesture).
    try {
      audio.current = audio.current ?? new AudioContext()
      void audio.current.resume()
    } catch {
      // the cues are a nicety, never a blocker
    }
    lastPhaseLabel.current = null
    lastBeep.current = -1
    lastWalkMinute.current = 0
    endCued.current = false
    const now = Date.now()
    setStartedAt(now)
    setElapsed(0)
    setPausedAt(null)
    setStage('live')
    void acquireQuiet()
  }

  function togglePause() {
    if (pausedAt === null) {
      setPausedAt(Date.now())
    } else {
      setStartedAt((s) => s + (Date.now() - pausedAt))
      setPausedAt(null)
    }
  }

  async function finish() {
    if (finishing.current) return
    finishing.current = true
    const e = pausedAt !== null ? (pausedAt - startedAt) / 1000 : (Date.now() - startedAt) / 1000
    // The total banked = what an earlier partial already banked (resumeOffset, 0 for a
    // fresh sit) + this session's own elapsed. Capped so we never log more than the
    // whole practice: on a "Finish Practice" resume the cap is the authored target
    // (secondsTarget); otherwise the plan's own run length. Open-ended Play has neither,
    // so it banks the raw elapsed.
    const done = resumeOffset + Math.round(e)
    const seconds = finishCap === null ? done : Math.min(done, finishCap)
    buzz(10)
    await finishWith(Math.max(0, seconds))
  }

  async function finishWith(seconds: number) {
    setStage('saving')
    await releaseQuiet()
    const result = await completeSession({
      practiceId: practice?.logsAs ?? practiceId,
      // A Movement sit is a real timed sit: it claims mode 'timer' so the economy +
      // timer-proof path runs unchanged. The movement mode tags the session row.
      mode: 'timer',
      pattern: null,
      seconds,
      resumeFromSec: resumeOffset,
      startedAt: new Date(startedAt).toISOString(),
      movementMode: plan.mode,
    })
    finishing.current = false
    if (isError(result)) {
      setStage('error')
      return
    }
    setPayload(result.data)
    setStage('reveal')
  }

  function leave() {
    void exitAppFullscreen()
    if (onExit) {
      onExit()
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.replace('/feed')
  }

  function closeReveal() {
    setPayload(null)
    void exitAppFullscreen()
    setStage('setup')
    if (onExit) onExit()
    else router.replace('/feed')
  }

  // --- screens --------------------------------------------------------------
  if (stage === 'reveal' && payload) {
    return (
      <Overlay>
        {/* Completion economy line: a partial sit banks 1 Zap and clears the day; come
            back to finish for the rest. A top-up (finished) celebrates the rest landing.
            Plain, no shame, no em or en dashes (docs/CONTENT-VOICE.md). */}
        {payload.partial && (
          <div className="shrink-0 rounded-xl border border-success/40 bg-success-bg/30 px-4 py-2.5 text-center text-sm text-text">
            1 Zap now, and the day is logged. Finish the rest of it later for the full reward.
          </div>
        )}
        {payload.finished && (
          <div className="shrink-0 rounded-xl border border-success/40 bg-success-bg/30 px-4 py-2.5 text-center text-sm text-text">
            You finished it. The rest of the Zaps just landed.
          </div>
        )}
        <Reveal payload={payload} onClose={closeReveal} onAction={onExit} />
      </Overlay>
    )
  }

  if (stage === 'saving') {
    return (
      <Overlay>
        <CenterScreen>
          <MovementArt className="block h-10 animate-pulse" />
          <p className="text-sm font-medium text-muted">Counting it up...</p>
        </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'error') {
    return (
      <Overlay>
        <CenterScreen>
          <p className="text-sm font-medium text-text">That did not save. Your movement still happened.</p>
          <button
            type="button"
            onClick={() => {
              const done = resumeOffset + Math.round((Date.now() - startedAt) / 1000)
              void finishWith(Math.max(0, finishCap === null ? done : Math.min(done, finishCap)))
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Try again
          </button>
        </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'live') {
    // Read the plan from the resume offset: a "Finish Practice" resume picks the plan
    // up where the earlier partial left off; a fresh sit reads from 0.
    const pos = phaseAt(plan, resumeOffset + elapsed)
    const tone = phaseTone(pos.phase.kind)
    const paused = pausedAt !== null
    const ended = pos.done
    // The final-3s danger ring: a timed phase about to change rings danger so the
    // shift is felt before it lands. Open-ended Play never rings.
    const closing = pos.remaining !== null && pos.remaining > 0 && pos.remaining <= 3
    const clockText = pos.remaining === null ? fmt(pos.phaseElapsed) : fmt(pos.remaining)

    return (
      <Overlay>
        {/* The clock block centers vertically; the action bar docks at the bottom and
            stays visible (LAYOUT directive). */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 pt-[max(3rem,env(safe-area-inset-top))]">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-success [animation-duration:3s]">
            <MovementArt className="block h-5" /> Movement
          </p>

          {/* The phase chip — color-coded, with the round counter for Strength. */}
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${tone.bg} ${tone.text}`}
          >
            {pos.phase.label}
            {plan.rounds > 1 && pos.phase.kind !== 'prepare' && (
              <span className="ml-2 tabular-nums opacity-80">
                Round {pos.round} of {plan.rounds}
              </span>
            )}
          </span>

          {/* The big clock. A timed phase rings its ringed wash; the final 3s flips
              the ring to danger. Play counts up with no ring. */}
          <div
            className={`flex h-56 w-56 items-center justify-center rounded-full ring-4 transition-colors ${
              closing ? 'ring-danger/60' : tone.ring
            } ${ended ? 'opacity-60' : ''}`}
          >
            <p className={`text-7xl font-semibold tabular-nums ${closing ? 'text-danger' : tone.text}`}>
              {clockText}
            </p>
          </div>

          {/* Next up — the line that lets the member anticipate the change. */}
          <p className="h-5 text-sm text-subtle">
            {ended ? 'Done' : pos.nextLabel ? `Next: ${pos.nextLabel}` : plan.openEnded ? 'Stop when you are done' : ' '}
          </p>
          {resumeOffset > 0 && (
            <p className="text-2xs text-subtle">Picking up where you left off.</p>
          )}
        </div>

        {/* Docked action bar — always visible, even as the screen scrolls. */}
        <div className="sticky bottom-0 -mx-6 flex flex-col items-center gap-3 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={() => {
              if (ended) {
                void finish()
                return
              }
              togglePause()
            }}
            className="min-w-44 rounded-full bg-primary px-10 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {ended ? 'Finish' : paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            className="rounded-full px-4 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
          >
            Stop &amp; Log
          </button>
        </div>
      </Overlay>
    )
  }

  // setup — pick the mode, then its preset, then Start.
  return (
    <Overlay>
      <div className="flex flex-1 flex-col px-2 pt-10">
        <div className="relative flex items-center justify-center pb-2">
          <p className="flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] text-success">
            <MovementArt className="block h-6" /> Movement
          </p>
          <button
            type="button"
            onClick={leave}
            aria-label="Close"
            className="absolute -right-2 -top-1 rounded-full p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="pb-6 text-center text-xs text-subtle">Move on a timer. Walk, run, flow, train, stretch, or play.</p>

        {/* The setup body centers vertically in the viewport and scrolls when it
            overflows; the Start bar below stays docked and visible (LAYOUT directive). */}
        <div className="flex flex-1 flex-col justify-center gap-5 py-2">
        {/* Mode */}
        <div>
          <Label>Mode</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {MOVEMENT_MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() => setMode(m.mode)}
                title={m.blurb}
                className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  m.mode === mode
                    ? 'border-success/60 bg-success-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                <span>{m.label}</span>
                <span className={`text-2xs font-normal ${m.mode === mode ? 'text-success' : 'text-subtle'}`}>
                  {m.blurb}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Per-mode preset / tuning */}
        {mode === 'walk' && (
          <div className="space-y-4">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {WALK_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === walkMinutes} onClick={() => setWalkMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${walkMinutes}m`}
                onLess={() => setWalkMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setWalkMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Reminders</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {WALK_INTERVAL_PRESETS.map((iv) => (
                  <Chip key={iv.value} active={iv.value === walkIntervalMin} onClick={() => setWalkIntervalMin(iv.value)}>
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A gentle chime on the minute, if you want a nudge.</p>
            </div>
          </div>
        )}

        {mode === 'run' && (
          <div className="space-y-4">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {RUN_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === runMinutes} onClick={() => setRunMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${runMinutes}m`}
                onLess={() => setRunMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setRunMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Split cues</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {RUN_INTERVAL_PRESETS.map((iv) => (
                  <Chip key={iv.value} active={iv.value === runIntervalMin} onClick={() => setRunIntervalMin(iv.value)}>
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A chime on the minute to mark your splits, if you want them.</p>
            </div>
          </div>
        )}

        {mode === 'yoga' && (
          <div>
            <Label>Flow</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {YOGA_PRESETS.map((y) => (
                <Chip key={y.kind} active={y.kind === yogaKind} onClick={() => setYogaKind(y.kind)} title={y.blurb}>
                  {y.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-2xs text-subtle">
              {YOGA_PRESETS.find((y) => y.kind === yogaKind)?.blurb}
            </p>
          </div>
        )}

        {mode === 'stretch' && (
          <div className="space-y-4">
            <div>
              <Label>Minutes</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {STRETCH_DURATION_PRESETS.map((m) => (
                  <Chip key={m} active={m === stretchMinutes} onClick={() => setStretchMinutes(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
              <Stepper
                className="mt-2"
                label={`${stretchMinutes}m`}
                onLess={() => setStretchMinutes((m) => Math.max(1, m - 1))}
                onMore={() => setStretchMinutes((m) => Math.min(240, m + 1))}
              />
            </div>
            <div>
              <Label>Switch sides</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STRETCH_INTERVAL_PRESETS.map((iv) => (
                  <Chip
                    key={iv.value}
                    active={iv.value === stretchIntervalMin}
                    onClick={() => setStretchIntervalMin(iv.value)}
                  >
                    {iv.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">A soft chime to switch sides, if you want one.</p>
            </div>
          </div>
        )}

        {mode === 'play' && (
          <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted">
            An open count-up. Start, move, and Stop when you are done.
          </div>
        )}

        {mode === 'strength' && (
          <div className="space-y-4">
            <div>
              <Label>Shape</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {STRENGTH_PRESETS.map((w) => (
                  <Chip key={w.kind} active={w.kind === strengthKind} onClick={() => pickStrength(w.kind)} title={w.blurb}>
                    {w.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-subtle">
                {STRENGTH_PRESETS.find((w) => w.kind === strengthKind)?.blurb}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Tune label="Work" value={`${workSec}s`} onLess={() => setWorkSec((s) => clampSeconds(s - 5))} onMore={() => setWorkSec((s) => clampSeconds(s + 5))} />
              <Tune label="Rest" value={restSec === 0 ? 'none' : `${restSec}s`} onLess={() => setRestSec((s) => Math.max(0, s - 5))} onMore={() => setRestSec((s) => Math.min(600, s + 5))} />
              <Tune label="Rounds" value={String(rounds)} onLess={() => setRounds((r) => clampRounds(r - 1))} onMore={() => setRounds((r) => clampRounds(r + 1))} />
            </div>
          </div>
        )}

        {/* The plan read-out + total. */}
        <p className="text-center text-xs text-subtle">
          {plan.label}
          {totalSeconds(plan) !== null && <span className="tabular-nums"> · {fmt(totalSeconds(plan)!)}</span>}
        </p>

        {/* Practice read-out (which log this banks). */}
        {practices.length > 1 && practice && (
          <div>
            <Label>Logs as</Label>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-text">
              <span className="truncate">{practice.title}</span>
              {practice.loggedToday && <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
            </p>
          </div>
        )}

        {/* Practice chooser — a simple select when several practices are adopted. */}
        {practices.length > 1 && (
          <div>
            <select
              value={practiceId}
              onChange={(e) => setPracticeId(e.target.value)}
              aria-label="Practice to log"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
            >
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}

        </div>

        {/* Docked Start bar — always visible, even as the setup body scrolls. */}
        <div className="sticky bottom-0 -mx-6 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
          {practicedToday >= 3 && (
            <p className="pb-1.5 text-center text-2xs text-subtle">{practicedToday} members practiced today.</p>
          )}
          <button
            type="button"
            onClick={() => void start()}
            disabled={!practiceId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-success/90 disabled:opacity-50"
          >
            <OnAirIcon className="h-4 w-4" /> Start moving
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// --- small setup atoms ------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</p>
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-xl border px-2 py-1.5 text-sm tabular-nums transition-colors ${
        active
          ? 'border-success/60 bg-success-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      {children}
    </button>
  )
}

function Stepper({
  label,
  onLess,
  onMore,
  className = '',
}: {
  label: string
  onLess: () => void
  onMore: () => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border border-border px-1.5 ${className}`}>
      <button
        type="button"
        onClick={onLess}
        aria-label="Less"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="text-sm font-semibold tabular-nums text-text">{label}</span>
      <button
        type="button"
        onClick={onMore}
        aria-label="More"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Tune({
  label,
  value,
  onLess,
  onMore,
}: {
  label: string
  value: string
  onLess: () => void
  onMore: () => void
}) {
  return (
    <div>
      <p className="mb-1 text-center text-2xs font-medium uppercase tracking-wider text-subtle">{label}</p>
      <Stepper label={value} onLess={onLess} onMore={onMore} />
    </div>
  )
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">{children}</div>
}
