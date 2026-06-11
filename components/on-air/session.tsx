'use client'

// On Air — the session machine (ADR-229, docs/ON-AIR.md): setup → live → reveal.
//
// The live screen is the takeover: wake lock keeps the screen lit for the whole
// sit, fullscreen is requested best-effort on mobile, and the only control is a
// quiet End. Ending early carries zero shame copy — the log still counts; the
// practice is the unit, not the duration. "Just log" skips the timer entirely
// so On Air is never a tax on logging.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus, X } from 'lucide-react'
import { LotusIcon, BreatheIcon, DialIcon, BoltIcon, BellCueIcon, VibrationIcon, OnAirIcon } from './icons'
import { completeSession } from '@/app/(main)/on-air/actions'
import { isError } from '@/lib/action-result'
import {
  BELL_TONES,
  BREATH_PATTERNS,
  CUSTOM_PHASE_MAX,
  CUSTOM_PHASE_MIN,
  DURATION_PRESETS,
  bellToneBySlug,
  breathPositionAt,
  buildCustomPattern,
  clampMinutes,
  patternBySlug,
  type BellTone,
  type BreathPhase,
  type OnAirPrefs,
  type RevealPayload,
  type SessionMode,
} from '@/lib/on-air'
import { BreathVisualizer } from './visualizer'
import { Reveal } from './reveal'

export interface OnAirPractice {
  id: string
  title: string
  loggedToday: boolean
}

type Stage = 'setup' | 'live' | 'saving' | 'reveal' | 'error'

// --- interval bell (Web Audio, no asset files) -------------------------------
// A soft bell/bowl strike: a SOFT ATTACK (a short fade-in, so there's no click —
// the click is what makes a synth ding feel harsh), a low peak well under
// earbud-hostile levels, and a long exponential ring-out. A strike layers the
// voice's partials with each higher overtone faded down, so the fundamental
// carries and the overtones just add bell body. Every call is wrapped so a flaky
// context never throws.

// One sine partial: fade in over ~25ms, ring out exponentially.
function ding(ctx: AudioContext, at: number, freq: number, durationSec: number, peak: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.025) // soft attack — no onset click
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

// One strike of a voice at `at`: fundamental loudest, overtones progressively
// quieter + a touch shorter, for a warm bell/bowl body.
function strike(ctx: AudioContext, tone: BellTone, at: number) {
  tone.freqs.forEach((f, i) => {
    const peak = 0.08 * Math.pow(0.55, i)
    const dur = tone.decay * (i === 0 ? 1 : 0.8)
    ding(ctx, at, f, dur, peak)
  })
}

/** One strike of the chosen voice. */
function chime(ctx: AudioContext | null, tone: BellTone) {
  if (!ctx) return
  try {
    strike(ctx, tone, ctx.currentTime)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** A gentle double strike to close the session, the second a touch softer. */
function endChime(ctx: AudioContext | null, tone: BellTone) {
  if (!ctx) return
  try {
    strike(ctx, tone, ctx.currentTime)
    strike(ctx, tone, ctx.currentTime + 0.55)
  } catch {
    // the bell is a nicety, never a blocker
  }
}

/** The takeover shell: while a session is live (and through the reveal) On Air
 *  owns the WHOLE viewport — above the app header and the bottom tab bar —
 *  until the member finishes or ends (P5). */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 py-5">{children}</div>
    </div>
  )
}

/** Vibration where supported (Android). iOS web has no vibration; never throw. */
function buzz(pulse: number | number[] = 15) {
  try {
    navigator.vibrate?.(pulse)
  } catch {
    // no vibration on this device
  }
}

export function OnAirSession({
  practices,
  defaultPracticeId,
  prefs,
  practicedToday = 0,
}: {
  practices: OnAirPractice[]
  defaultPracticeId: string | null
  prefs: OnAirPrefs
  /** Distinct members with a practice log today (presence line, shown at ≥3). */
  practicedToday?: number
}) {
  const [stage, setStage] = useState<Stage>('setup')
  const [practiceId, setPracticeId] = useState(
    defaultPracticeId ?? practices.find((p) => !p.loggedToday)?.id ?? practices[0]?.id ?? '',
  )
  const [mode, setMode] = useState<SessionMode>(prefs.mode)
  const [minutes, setMinutes] = useState(prefs.minutes)
  const [patternSlug, setPatternSlug] = useState(prefs.pattern)
  const [customIn, setCustomIn] = useState(prefs.customIn ?? 4)
  const [customHold, setCustomHold] = useState(prefs.customHold ?? 4)
  const [customOut, setCustomOut] = useState(prefs.customOut ?? 6)
  const [bell, setBell] = useState(prefs.bell ?? false)
  const [bellToneSlug, setBellToneSlug] = useState(prefs.bellTone ?? 'soft')
  const [haptics, setHaptics] = useState(prefs.haptics ?? false)
  const router = useRouter()
  const [startedAt, setStartedAt] = useState(0)
  const [remaining, setRemaining] = useState(0)
  // Paused = the wall-clock moment the member tapped Pause; resuming shifts
  // startedAt forward by the pause length, so every elapsed-based read (clock,
  // cues, visualizer) continues seamlessly and pauses never count as airtime.
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [payload, setPayload] = useState<RevealPayload | null>(null)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const finishing = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const lastPhase = useRef<BreathPhase | null>(null)
  const lastMinute = useRef(0)
  const endCued = useRef(false)

  const pattern = useMemo(
    () =>
      patternSlug === 'custom'
        ? buildCustomPattern(customIn, customHold, customOut)
        : patternBySlug(patternSlug),
    [patternSlug, customIn, customHold, customOut],
  )
  const practice = practices.find((p) => p.id === practiceId)

  // --- takeover plumbing ----------------------------------------------------

  async function acquireQuiet() {
    try {
      wakeLock.current = await (navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
      }).wakeLock?.request('screen') ?? null
    } catch {
      // wake lock is progressive enhancement
    }
    try {
      if (window.matchMedia('(max-width: 768px)').matches) {
        await document.documentElement.requestFullscreen?.()
      }
    } catch {
      // fullscreen is progressive enhancement
    }
  }

  async function releaseQuiet() {
    try {
      await wakeLock.current?.release()
    } catch {
      /* released already */
    }
    wakeLock.current = null
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* fine */
    }
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

  // --- the clock --------------------------------------------------------------

  useEffect(() => {
    if (stage !== 'live') return
    const total = minutes * 60
    const id = setInterval(() => {
      if (pausedAt !== null) return
      const elapsed = (Date.now() - startedAt) / 1000
      const left = Math.max(0, total - elapsed)
      setRemaining(left)
      // Cues: a phase-change ding/tap in breath mode, a minute ding on the
      // timer. At zero the end bell rings ONCE and the screen waits — the
      // member collects with Finish in their own time (P10), no auto-advance.
      if (left > 0) {
        if (mode === 'breath') {
          const { phase } = breathPositionAt(pattern, elapsed)
          if (lastPhase.current && phase !== lastPhase.current) {
            if (bell) chime(audio.current, bellToneBySlug(bellToneSlug))
            if (haptics) buzz(15)
          }
          lastPhase.current = phase
        } else {
          const minute = Math.floor(elapsed / 60)
          if (minute > lastMinute.current) {
            lastMinute.current = minute
            if (bell) chime(audio.current, bellToneBySlug(bellToneSlug))
          }
        }
      } else if (!endCued.current) {
        endCued.current = true
        if (bell) endChime(audio.current, bellToneBySlug(bellToneSlug))
        if (haptics) buzz([30, 80, 30])
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, startedAt, minutes, pausedAt])

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

  // --- transitions -------------------------------------------------------------

  async function start() {
    if (!practiceId) return
    if (mode === 'log') {
      void finishWith(0, null)
      return
    }
    if (bell) {
      // Lazily, on the tap: autoplay policy only unlocks audio in a gesture.
      try {
        audio.current = audio.current ?? new AudioContext()
        void audio.current.resume()
      } catch {
        // the bell is a nicety, never a blocker
      }
    }
    lastPhase.current = null
    lastMinute.current = 0
    endCued.current = false
    // The live screen opens ARMED, not running (owner ask): the clock sits
    // paused at zero until the member taps Start — settle in first. Arming
    // counts as a pause from the very first millisecond, so the existing
    // Start ⇄ Pause machinery (and the airtime math) needs nothing new.
    const now = Date.now()
    setStartedAt(now)
    setPausedAt(now)
    setRemaining(minutes * 60)
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

  async function finish(early: boolean) {
    if (finishing.current) return
    finishing.current = true
    // The end bell already rang when the clock hit zero; an early Close Session
    // gets a small ack tap only. Paused time never counts as airtime.
    const elapsedMs = (pausedAt ?? Date.now()) - startedAt
    const seconds = early ? Math.max(0, Math.round(elapsedMs / 1000)) : minutes * 60
    if (haptics && early) buzz(10)
    await finishWith(seconds, new Date(startedAt).toISOString())
  }

  async function finishWith(seconds: number, startedIso: string | null) {
    setStage('saving')
    await releaseQuiet()
    const result = await completeSession({
      practiceId,
      mode,
      pattern: patternSlug,
      seconds,
      startedAt: startedIso,
      customIn,
      customHold,
      customOut,
      bell,
      bellTone: bellToneSlug,
      haptics,
    })
    finishing.current = false
    if (isError(result)) {
      setStage('error')
      return
    }
    setPayload(result.data)
    setStage('reveal')
  }

  // --- screens -------------------------------------------------------------------

  // Done or swiped off the last card: drop the takeover and return to the
  // screen the member came FROM (the page where they hit the Zap button or
  // the board's radio). Direct entries (PWA shortcut, typed URL) have no app
  // history, so they land on home instead of exiting the app.
  function leave() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.replace('/feed')
    }
  }

  function closeReveal() {
    setPayload(null)
    setStage('setup')
    leave()
  }

  if (stage === 'reveal' && payload) {
    return (
      <Overlay>
        <Reveal payload={payload} onClose={closeReveal} />
      </Overlay>
    )
  }

  if (stage === 'saving') {
    return (
      <Overlay>
      <CenterScreen>
        <OnAirIcon className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm font-medium text-muted">Tuning back in. Counting it up…</p>
      </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'error') {
    return (
      <Overlay>
      <CenterScreen>
        <p className="text-sm font-medium text-text">That didn’t save. Your sit still happened.</p>
        <button
          type="button"
          onClick={() => void finishWith(Math.round((Date.now() - startedAt) / 1000), null)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
        >
          Try again
        </button>
      </CenterScreen>
      </Overlay>
    )
  }

  if (stage === 'live') {
    const mm = Math.floor(remaining / 60)
    const ss = Math.floor(remaining % 60)
    const ended = remaining <= 0
    const paused = pausedAt !== null
    return (
      <Overlay>
        <div className="flex flex-1 flex-col items-center justify-between pb-10 pt-12">
          <p className="flex animate-pulse items-center gap-2.5 text-sm font-bold uppercase tracking-[0.3em] text-primary-strong [animation-duration:3s]">
            <LotusIcon className="h-[18px] w-[18px]" /> Mindless
          </p>

          <div className="flex flex-col items-center gap-5">
            {mode === 'breath' ? (
              <BreathVisualizer pattern={pattern} startedAt={startedAt} paused={paused || ended} />
            ) : (
              <p className="text-8xl font-bold tabular-nums text-text">
                {mm}:{String(ss).padStart(2, '0')}
              </p>
            )}
            {mode === 'breath' && (
              <p className="text-base tabular-nums text-subtle">
                {ended ? 'Done' : `${mm}:${String(ss).padStart(2, '0')} left`}
              </p>
            )}
          </div>

          {/* The dynamic control (P10): Pause ⇄ Start while running, Finish once
              the clock lands. Finish and Close Session BOTH log and move on —
              ending early is never punished. */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => (ended ? void finish(false) : togglePause())}
              className="min-w-44 rounded-full bg-primary px-10 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {ended ? 'Finish' : paused ? 'Start' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={() => void finish(!ended)}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
            >
              Close Session
            </button>
          </div>
        </div>
      </Overlay>
    )
  }

  // setup — the same full-page takeover as the sit (P8): entering Mindless means
  // the world steps back BEFORE the timer starts. No app chrome, one compact
  // viewport, the wordmark on top (same mark as the live screen, still rather
  // than pulsing) and Tune out pinned above the fold in a sticky footer.
  return (
    <Overlay>
      <div className="flex flex-1 flex-col px-2 pt-3">
      <div className="relative flex items-center justify-center pb-2">
        <p className="flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] text-primary-strong">
          <LotusIcon className="h-6 w-6" /> Mindless
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
      <p className="pb-6 text-center text-xs text-subtle">The world can wait a few minutes.</p>

      <div className="space-y-5">
        {practices.length > 1 && (
        <div>
          <Label>Practice</Label>
          {/* One scrollable chip row — stays compact however long the list grows.
              With a single adopted practice it's auto-selected and the section
              hides entirely (owner ask: no badge when there's nothing to pick). */}
          <div className="-mx-8 mt-2 flex gap-1.5 overflow-x-auto px-8 pb-0.5">
            {practices.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPracticeId(p.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  p.id === practiceId
                    ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                <span className="max-w-[12rem] truncate">{p.title}</span>
                {p.loggedToday && <Check className="h-3 w-3 shrink-0 text-success" />}
              </button>
            ))}
          </div>
        </div>
        )}

        <div>
          <Label>Mode</Label>
          {/* Meditate = the plain silent countdown; Breathe = the guided rings. */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ModeButton active={mode === 'timer'} onClick={() => setMode('timer')} icon={LotusIcon} label="Meditate" />
            <ModeButton active={mode === 'breath'} onClick={() => setMode('breath')} icon={BreatheIcon} label="Breathe" />
            <ModeButton active={mode === 'log'} onClick={() => setMode('log')} icon={BoltIcon} label="Just Log" />
          </div>
        </div>

        {mode === 'breath' && (
          <div>
            <Label>Pattern</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {BREATH_PATTERNS.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setPatternSlug(p.slug)}
                  title={p.blurb}
                  className={`rounded-xl border px-2 py-1.5 text-sm transition-colors ${
                    p.slug === patternSlug
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPatternSlug('custom')}
                title="Your counts. Set each phase to what fits."
                className={`rounded-xl border px-2 py-1.5 text-sm transition-colors ${
                  patternSlug === 'custom'
                    ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                    : 'border-border text-muted hover:bg-surface-elevated'
                }`}
              >
                Custom
              </button>
            </div>
            <p className="mt-2 text-xs text-subtle">{pattern.blurb}</p>
            {patternSlug === 'custom' && (
              <div className="mt-2.5 space-y-2.5 rounded-xl border border-border px-3.5 py-2.5">
                <PhaseSlider label="Breathe in" min={CUSTOM_PHASE_MIN} value={customIn} onChange={setCustomIn} />
                <PhaseSlider label="Hold" min={0} value={customHold} onChange={setCustomHold} />
                <PhaseSlider label="Let go" min={CUSTOM_PHASE_MIN} value={customOut} onChange={setCustomOut} />
              </div>
            )}
          </div>
        )}

        {mode !== 'log' && (
          <div>
            <Label>Minutes</Label>
            <div className="mt-2 flex gap-2">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`flex-1 rounded-xl border px-2 py-1.5 text-sm tabular-nums transition-colors ${
                    m === minutes
                      ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                      : 'border-border text-muted hover:bg-surface-elevated'
                  }`}
                >
                  {m}
                </button>
              ))}
              {/* The stepper: any length, one minute at a time (1–120). */}
              <div className="flex flex-[1.6] items-center justify-between rounded-xl border border-border px-1.5">
                <button
                  type="button"
                  onClick={() => setMinutes((m) => clampMinutes(m - 1))}
                  aria-label="One minute less"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-sm font-semibold tabular-nums text-text">{minutes}m</span>
                <button
                  type="button"
                  onClick={() => setMinutes((m) => clampMinutes(m + 1))}
                  aria-label="One minute more"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {mode !== 'log' && (
          <div>
            <Label>Cues</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ToggleChip
                active={bell}
                onClick={() => setBell(!bell)}
                icon={BellCueIcon}
                label="Sound"
                title={
                  mode === 'breath'
                    ? 'A soft bell at each phase change.'
                    : 'A soft bell at each minute.'
                }
              />
              <ToggleChip
                active={haptics}
                onClick={() => setHaptics(!haptics)}
                icon={VibrationIcon}
                label="Vibration"
                title="A small tap at each phase change. Not every phone supports it."
              />
            </div>
            {bell && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {BELL_TONES.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => {
                      setBellToneSlug(t.slug)
                      // A one-strike preview on the tap (the gesture unlocks audio).
                      try {
                        audio.current = audio.current ?? new AudioContext()
                        void audio.current.resume()
                        chime(audio.current, t)
                      } catch {
                        // preview is a nicety
                      }
                    }}
                    className={`rounded-xl border px-2 py-1.5 text-xs transition-colors ${
                      t.slug === bellToneSlug
                        ? 'border-primary bg-primary-bg/40 font-semibold text-text'
                        : 'border-border text-muted hover:bg-surface-elevated'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center">
          <a href="/on-air/dispatches" className="text-2xs font-medium text-subtle hover:text-text">
            Past Dispatches from Vera
          </a>
        </p>
      </div>

      {/* Pinned: Tune out never sinks below the fold, even with Custom open. */}
      <div className="sticky bottom-0 -mx-8 mt-auto bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-8 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6">
        {practice?.loggedToday && mode !== 'log' && (
          <p className="pb-1.5 text-center text-2xs text-subtle">
            {practice.title} is already counted today. The sit still banks airtime.
          </p>
        )}
        {practicedToday >= 3 && (
          <p className="pb-1.5 text-center text-2xs text-subtle">
            {practicedToday} members practiced today.
          </p>
        )}
        <button
          type="button"
          onClick={() => void start()}
          disabled={!practiceId}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <OnAirIcon className="h-4 w-4" /> {mode === 'log' ? 'Log it' : 'Tune out'}
        </button>
      </div>
      </div>
    </Overlay>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</p>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors ${
        active
          ? 'border-primary bg-primary-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function ToggleChip({
  active,
  onClick,
  icon: Icon,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs transition-colors ${
        active
          ? 'border-primary bg-primary-bg/40 font-semibold text-text'
          : 'border-border text-muted hover:bg-surface-elevated'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className={active ? 'text-primary-strong' : 'text-subtle'}>{active ? 'on' : 'off'}</span>
    </button>
  )
}

function PhaseSlider({
  label,
  min,
  value,
  onChange,
}: {
  label: string
  min: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 flex items-baseline justify-between">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-text">
          {value === 0 ? 'off' : `${value}s`}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={CUSTOM_PHASE_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}

function CenterScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">{children}</div>
  )
}
